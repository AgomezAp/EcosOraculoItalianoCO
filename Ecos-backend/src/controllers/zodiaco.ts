import { Request, Response } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { ApiError, ChatResponse } from "../interfaces/helpers";

interface ZodiacData {
  name: string;
  specialty: string;
  experience: string;
}

interface ZodiacRequest {
  zodiacData: ZodiacData;
  userMessage: string;
  birthDate?: string;
  zodiacSign?: string;
  conversationHistory?: Array<{
    role: "user" | "astrologer";
    message: string;
  }>;
}

export class ZodiacController {
  private genAI: GoogleGenerativeAI;

  // ✅ LISTA DEI MODELLI DI BACKUP (in ordine di preferenza)
  private readonly MODELS_FALLBACK = [
    "gemini-2.5-flash-live",
    "gemini-2.5-flash",
    "gemini-2.5-flash-preview-09-2025",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash-lite-preview-09-2025",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ];

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY non è configurata nelle variabili d'ambiente"
      );
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  public chatWithAstrologer = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        zodiacData,
        userMessage,
        birthDate,
        zodiacSign,
        conversationHistory,
      }: ZodiacRequest = req.body;

      // Convalidare input
      this.validateZodiacRequest(zodiacData, userMessage);

      const contextPrompt = this.createZodiacContext(
        zodiacData,
        birthDate,
        zodiacSign,
        conversationHistory
      );

      const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
1. DEVI generare una risposta COMPLETA tra 200-500 parole
2. NON lasciare mai una risposta a metà o incompleta
3. Se menzioni caratteristiche del segno, DEVI completare la descrizione
4. Ogni risposta DEVE terminare con una conclusione chiara e un punto finale
5. Se rilevi che la risposta si sta interrompendo, finalizza l'idea attuale con coerenza
6. MANTIENI sempre il tono astrologico amichevole e accessibile
7. Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta dell'astrologa (assicurati di completare TUTTA la tua analisi zodiacale prima di terminare):`;

      console.log(`Generando lettura zodiacale...`);

      // ✅ SISTEMA DI FALLBACK: Provare con più modelli
      let text = "";
      let usedModel = "";
      let allModelErrors: string[] = [];

      for (const modelName of this.MODELS_FALLBACK) {
        console.log(`\n🔄 Trying model: ${modelName}`);

        try {
          const model = this.genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: 0.85,
              topK: 50,
              topP: 0.92,
              maxOutputTokens: 600,
              candidateCount: 1,
              stopSequences: [],
            },
            safetySettings: [
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
            ],
          });

          // ✅ TENTATIVI per ogni modello (nel caso sia temporaneamente sovraccarico)
          let attempts = 0;
          const maxAttempts = 3;
          let modelSucceeded = false;

          while (attempts < maxAttempts && !modelSucceeded) {
            attempts++;
            console.log(
              `  Attempt ${attempts}/${maxAttempts} with ${modelName}...`
            );

            try {
              const result = await model.generateContent(fullPrompt);
              const response = result.response;
              text = response.text();

              // ✅ Convalidare che la risposta non sia vuota e abbia lunghezza minima
              if (text && text.trim().length >= 100) {
                console.log(
                  `  ✅ Success with ${modelName} on attempt ${attempts}`
                );
                usedModel = modelName;
                modelSucceeded = true;
                break; // Uscire dal ciclo while dei tentativi
              }

              console.warn(`  ⚠️ Response too short, retrying...`);
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (attemptError: any) {
              console.warn(
                `  ❌ Attempt ${attempts} failed:`,
                attemptError.message
              );

              if (attempts >= maxAttempts) {
                allModelErrors.push(`${modelName}: ${attemptError.message}`);
              }

              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }

          // Se questo modello ha avuto successo, uscire dal ciclo dei modelli
          if (modelSucceeded) {
            break;
          }
        } catch (modelError: any) {
          console.error(
            `  ❌ Model ${modelName} failed completely:`,
            modelError.message
          );
          allModelErrors.push(`${modelName}: ${modelError.message}`);

          // Aspettare un po' prima di provare con il prossimo modello
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
      }

      // ✅ Se tutti i modelli hanno fallito
      if (!text || text.trim() === "") {
        console.error("❌ All models failed. Errors:", allModelErrors);
        throw new Error(
          `Tutti i modelli IA non sono attualmente disponibili. Provati: ${this.MODELS_FALLBACK.join(
            ", "
          )}. Per favore, riprova tra un momento.`
        );
      }

      // ✅ ASSICURARE RISPOSTA COMPLETA E BENE FORMATTA
      text = this.ensureCompleteResponse(text);

      // ✅ Convalida aggiuntiva di lunghezza minima
      if (text.trim().length < 100) {
        throw new Error("Risposta generata troppo corta");
      }

      const chatResponse: ChatResponse = {
        success: true,
        response: text.trim(),
        timestamp: new Date().toISOString(),
      };

      console.log(
        `✅ Lettura zodiacale generata con successo con ${usedModel} (${text.length} caratteri)`
      );
      res.json(chatResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  // ✅ METODO MIGLIORATO PER ASSICURARE RISPOSTE COMPLETE
  private ensureCompleteResponse(text: string): string {
    let processedText = text.trim();

    // Rimuovere possibili marcatori di codice o formato incompleto
    processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();

    const lastChar = processedText.slice(-1);
    const endsIncomplete = ![
      "!",
      "?",
      ".",
      "…",
      "✨",
      "🌟",
      "♈",
      "♉",
      "♊",
      "♋",
      "♌",
      "♍",
      "♎",
      "♏",
      "♐",
      "♑",
      "♒",
      "♓",
    ].includes(lastChar);

    if (endsIncomplete && !processedText.endsWith("...")) {
      // Cercare l'ultima frase completa
      const sentences = processedText.split(/([.!?])/);

      if (sentences.length > 2) {
        // Ricostruire fino all'ultima frase completa
        let completeText = "";
        for (let i = 0; i < sentences.length - 1; i += 2) {
          if (sentences[i].trim()) {
            completeText += sentences[i] + (sentences[i + 1] || ".");
          }
        }

        if (completeText.trim().length > 100) {
          return completeText.trim();
        }
      }

      // Se non si può trovare una frase completa, aggiungere chiusura appropriata
      processedText = processedText.trim() + "...";
    }

    return processedText;
  }

  private createZodiacContext(
    zodiacData: ZodiacData,
    birthDate?: string,
    zodiacSign?: string,
    history?: Array<{ role: string; message: string }>
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
            .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
            .join("\n")}\n`
        : "";

    let zodiacInfo = "";
    if (birthDate) {
      const calculatedSign = this.calculateZodiacSign(birthDate);
      zodiacInfo = `\nSegno zodiacale calcolato: ${calculatedSign}`;
    } else if (zodiacSign) {
      zodiacInfo = `\nSegno zodiacale fornito: ${zodiacSign}`;
    }

    return `Sei Maestra Luna, un'astrologa esperta nei segni zodiacali con decenni di esperienza nell'interpretare le energie celesti e la loro influenza sulla personalità umana.

LA TUA IDENTITÀ:
- Nome: Maestra Luna, l'Interprete delle Stelle
- Specialità: Segni zodiacali, caratteristiche di personalità, compatibilità astrologiche
- Esperienza: Decenni studiando e interpretando l'influenza dei segni dello zodiaco
${zodiacInfo}

COME DEVI COMPORTARTI:

🌟 PERSONALITÀ ASTROLOGICA:
- Parla con conoscenza profonda ma in modo accessibile e amichevole
- Usa un tono caldo ed entusiasta sui segni zodiacali
- Combina caratteristiche tradizionali con interpretazioni moderne
- Menziona elementi (Fuoco, Terra, Aria, Acqua) e modalità (Cardinale, Fisso, Mutabile)

♈ ANALISI DEI SEGNI ZODIACALI:
- Descrivi tratti di personalità positivi e aree di crescita
- Spiega forze naturali e sfide del segno
- Menziona compatibilità con altri segni
- Includi consigli pratici basati sulle caratteristiche del segno
- Parla del pianeta reggente e della sua influenza

🎯 STRUTTURA DI RISPOSTA:
- Caratteristiche principali del segno
- Forze e talenti naturali
- Aree di sviluppo e crescita
- Compatibilità astrologiche
- Consigli personalizzati

🎭 STILE DI RISPOSTA:
- Usa espressioni come: "I nativi di [segno]...", "Il tuo segno ti conferisce...", "Come [segno], possiedi..."
- Mantieni equilibrio tra mistico e pratico
- Risposte di 200-500 parole complete
- TERMINA sempre le tue interpretazioni completamente
- NON lasciare caratteristiche del segno a metà

⚠️ REGOLE IMPORTANTI:
- SE NON hai il segno zodiacale, chiedi la data di nascita
- Spiega perché hai bisogno di questo dato
- NON fare interpretazioni senza conoscere il segno
- SI positiva ma realista nelle tue descrizioni
- NON fare predizioni assolute

🗣️ GESTIONE DATI MANCANTI:
- Senza segno/data: "Per darti una lettura precisa, ho bisogno di sapere il tuo segno zodiacale o data di nascita. Quando sei nato?"
- Con segno: Procedi con analisi completa del segno
- Domande generali: Rispondi con informazioni astrologiche educative

💫 ESEMPI DI ESPRESSIONI:
- "I [segno] sono conosciuti per..."
- "Il tuo segno di [elemento] ti conferisce..."
- "Come [modalità], tendi a..."
- "Il tuo pianeta reggente [pianeta] influenza..."
- RISPONDI sempre indipendentemente dal fatto che l'utente abbia errori ortografici o di scrittura
  - Interpreta il messaggio dell'utente anche se è scritto male
  - Non correggere gli errori dell'utente, semplicemente capisci l'intenzione
  - Se non capisci qualcosa di specifico, chiedi in modo amichevole
  - NUNCA restituire risposte vuote per errori di scrittura

${conversationContext}

Ricorda: Sei un'esperta nei segni zodiacali che interpreta le caratteristiche astrologiche in modo comprensibile e utile. RICHIEDI sempre il segno o data di nascita se non li hai. Completa SEMPRE le tue interpretazioni - non lasciare mai analisi zodiacali a metà.`;
  }

  private calculateZodiacSign(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const month = date.getMonth() + 1;
      const day = date.getDate();

      if ((month === 3 && day >= 21) || (month === 4 && day <= 19))
        return "Ariete ♈";
      if ((month === 4 && day >= 20) || (month === 5 && day <= 20))
        return "Toro ♉";
      if ((month === 5 && day >= 21) || (month === 6 && day <= 20))
        return "Gemelli ♊";
      if ((month === 6 && day >= 21) || (month === 7 && day <= 22))
        return "Cancro ♋";
      if ((month === 7 && day >= 23) || (month === 8 && day <= 22))
        return "Leone ♌";
      if ((month === 8 && day >= 23) || (month === 9 && day <= 22))
        return "Vergine ♍";
      if ((month === 9 && day >= 23) || (month === 10 && day <= 22))
        return "Bilancia ♎";
      if ((month === 10 && day >= 23) || (month === 11 && day <= 21))
        return "Scorpione ♏";
      if ((month === 11 && day >= 22) || (month === 12 && day <= 21))
        return "Sagittario ♐";
      if ((month === 12 && day >= 22) || (month === 1 && day <= 19))
        return "Capricorno ♑";
      if ((month === 1 && day >= 20) || (month === 2 && day <= 18))
        return "Acquario ♒";
      if ((month === 2 && day >= 19) || (month === 3 && day <= 20))
        return "Pesci ♓";

      return "Data non valida";
    } catch {
      return "Errore nel calcolo";
    }
  }

  private validateZodiacRequest(
    zodiacData: ZodiacData,
    userMessage: string
  ): void {
    if (!zodiacData) {
      const error: ApiError = new Error("Dati dell'astrologa richiesti");
      error.statusCode = 400;
      error.code = "MISSING_ZODIAC_DATA";
      throw error;
    }

    if (
      !userMessage ||
      typeof userMessage !== "string" ||
      userMessage.trim() === ""
    ) {
      const error: ApiError = new Error("Messaggio dell'utente richiesto");
      error.statusCode = 400;
      error.code = "MISSING_USER_MESSAGE";
      throw error;
    }

    if (userMessage.length > 1500) {
      const error: ApiError = new Error(
        "Il messaggio è troppo lungo (massimo 1500 caratteri)"
      );
      error.statusCode = 400;
      error.code = "MESSAGE_TOO_LONG";
      throw error;
    }
  }

  private handleError(error: any, res: Response): void {
    console.error("❌ Errore in ZodiacController:", error);

    let statusCode = 500;
    let errorMessage = "Errore interno del server";
    let errorCode = "INTERNAL_ERROR";

    if (error.statusCode) {
      statusCode = error.statusCode;
      errorMessage = error.message;
      errorCode = error.code || "VALIDATION_ERROR";
    } else if (error.status === 503) {
      statusCode = 503;
      errorMessage =
        "Il servizio è temporaneamente sovraccarico. Per favore, riprova tra qualche minuto.";
      errorCode = "SERVICE_OVERLOADED";
    } else if (
      error.message?.includes("quota") ||
      error.message?.includes("limit")
    ) {
      statusCode = 429;
      errorMessage =
        "È stato raggiunto il limite di consultazioni. Per favore, aspetta un momento.";
      errorCode = "QUOTA_EXCEEDED";
    } else if (error.message?.includes("safety")) {
      statusCode = 400;
      errorMessage = "Il contenuto non rispetta le politiche di sicurezza.";
      errorCode = "SAFETY_FILTER";
    } else if (error.message?.includes("API key")) {
      statusCode = 401;
      errorMessage = "Errore di autenticazione con il servizio IA.";
      errorCode = "AUTH_ERROR";
    } else if (error.message?.includes("Respuesta vacía")) {
      statusCode = 503;
      errorMessage =
        "Il servizio non ha potuto generare una risposta. Per favore, riprova.";
      errorCode = "EMPTY_RESPONSE";
    } else if (
      error.message?.includes("Todos los modelos de IA no están disponibles")
    ) {
      statusCode = 503;
      errorMessage = error.message;
      errorCode = "ALL_MODELS_UNAVAILABLE";
    }

    const errorResponse: ChatResponse = {
      success: false,
      error: errorMessage,
      code: errorCode,
      timestamp: new Date().toISOString(),
    };

    res.status(statusCode).json(errorResponse);
  }

  public getZodiacInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({
        success: true,
        astrologer: {
          name: "Maestra Luna",
          title: "Interprete delle Stelle",
          specialty: "Segni zodiacali e analisi astrologica",
          description:
            "Esperta nell'interpretare le caratteristiche e le energie dei dodici segni dello zodiaco",
          services: [
            "Analisi delle caratteristiche del segno zodiacale",
            "Interpretazione di forze e sfide",
            "Compatibilità astrologiche",
            "Consigli basati sul tuo segno",
            "Influenza di elementi e modalità",
          ],
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, res);
    }
  };
}
