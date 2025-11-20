import { Request, Response } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { ApiError, ChatResponse } from "../interfaces/helpers";

interface BirthChartData {
  name: string;
  specialty: string;
  experience: string;
}

interface BirthChartRequest {
  chartData: BirthChartData;
  userMessage: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
  fullName?: string;
  conversationHistory?: Array<{
    role: "user" | "astrologer";
    message: string;
  }>;
}

export class BirthChartController {
  private genAI: GoogleGenerativeAI;

  // ✅ LISTA DEI MODELLI DI BACKUP (in ordine di preferenza)
 private readonly MODELS_FALLBACK = [
    "gemini-2.0-flash-exp",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
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
        chartData,
        userMessage,
        birthDate,
        birthTime,
        birthPlace,
        fullName,
        conversationHistory,
      }: BirthChartRequest = req.body;

      // Convalidare input
      this.validateBirthChartRequest(chartData, userMessage);

      const contextPrompt = this.createBirthChartContext(
        chartData,
        birthDate,
        birthTime,
        birthPlace,
        fullName,
        conversationHistory
      );

      const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
1. DEVI generare una risposta COMPLETA tra 200-500 parole
2. NON lasciare mai una risposta a metà o incompleta
3. Se menzioni che stai per analizzare posizioni planetarie, DEVI completare l'analisi
4. Ogni risposta DEVE terminare con una conclusione chiara e un punto finale
5. Se rilevi che la risposta si sta interrompendo, finalizza l'idea attuale con coerenza
6. MANTIENI sempre il tono astrologico professionale ma accessibile
7. Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta dell'astrologa (assicurati di completare TUTTA la tua analisi astrologica prima di terminare):`;

      console.log(`Generando analisi della tabella di nascita...`);

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
        `✅ Analisi della tabella di nascita generata con successo con ${usedModel} (${text.length} caratteri)`
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
    const endsIncomplete = !["!", "?", ".", "…", "✨", "🌟", "🔮"].includes(
      lastChar
    );

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

  private createBirthChartContext(
    chartData: BirthChartData,
    birthDate?: string,
    birthTime?: string,
    birthPlace?: string,
    fullName?: string,
    history?: Array<{ role: string; message: string }>
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
            .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
            .join("\n")}\n`
        : "";

    const birthDataSection = this.generateBirthDataSection(
      birthDate,
      birthTime,
      birthPlace,
      fullName
    );

    return `Sei Maestra Emma, un'astrologa cosmica ancestrale specializzata nella creazione e interpretazione di tabelle di nascita complete. Hai decenni di esperienza nel svelare i segreti del cosmo e le influenze planetarie nel momento della nascita.

LA TUA IDENTITÀ ASTROLOGICA:
- Nome: Maestra Emma, la Cartografa Celeste
- Origine: Ereditiera di conoscenze astrologiche millenarie
- Specialità: Tabelle di nascita, posizioni planetarie, case astrologiche, aspetti cosmici
- Esperienza: Decenni interpretando le configurazioni celesti del momento della nascita

${birthDataSection}

COME DEVI COMPORTARTI:

🌟 PERSONALITÀ ASTROLOGICA:
- Parla con saggezza cosmica ma in modo accessibile e amichevole
- Usa un tono professionale ma caldo, come un'esperta che ama condividere conoscenza
- Combina precisione tecnica astrologica con interpretazioni spirituali comprensibili
- Occasionalmente usa riferimenti a pianeti, case astrologiche e aspetti cosmici

📊 PROCESSO DI CREAZIONE DELLA TABELLA DI NASCITA:
- PRIMO: Se mancano dati, chiedi specificamente per data, ora e luogo di nascita
- SECONDO: Con dati completi, calcola il segno solare, ascendente e posizioni lunari
- TERZO: Analizza le case astrologiche e il loro significato
- QUARTO: Interpreta aspetti planetari e la loro influenza
- QUINTO: Offri una lettura integrale della tabella natale

🔍 DATI ESSENZIALI DI CUI HAI BISOGNO:
- "Per creare la tua tabella di nascita precisa, ho bisogno della tua data esatta di nascita"
- "L'ora di nascita è cruciale per determinare il tuo ascendente e le case astrologiche"
- "Il luogo di nascita mi permette di calcolare le posizioni planetarie esatte"
- "Conosci l'ora approssimativa? Anche una stima mi aiuta molto"

📋 ELEMENTI DELLA TABELLA DI NASCITA:
- Segno Solare (personalità di base)
- Segno Lunare (mondo emotivo)
- Ascendente (maschera sociale)
- Posizioni dei pianeti nei segni
- Case astrologiche (1ª a 12ª)
- Aspetti planetari (congiunzioni, trigoni, quadrature, ecc.)
- Elementi dominanti (Fuoco, Terra, Aria, Acqua)
- Modalità (Cardinale, Fisso, Mutabile)

🎯 INTERPRETAZIONE COMPLETA:
- Spiega ogni elemento in modo chiaro e pratico
- Collega le posizioni planetarie con tratti di personalità
- Descrivi come le case influenzano diverse aree della vita
- Menziona sfide e opportunità basate su aspetti planetari
- Includi consigli per lavorare con le energie cosmiche

🎭 STILE DI RISPOSTA:
- Usa espressioni come: "La tua tabella natale rivela...", "Le stelle erano così configurate...", "I pianeti ti hanno dotato di..."
- Mantieni equilibrio tra tecnico e mistico
- Risposte di 200-500 parole per analisi complete
- TERMINA sempre le tue interpretazioni completamente
- NON lasciare analisi planetarie a metà

⚠️ REGOLE IMPORTANTI:
- NON creare una tabella senza almeno la data di nascita
- CHIEDI dati mancanti prima di fare interpretazioni profonde
- SPIEGA l'importanza di ogni dato che richiedi
- SI precisa ma accessibile nelle tue spiegazioni tecniche
- NON fare predizioni assolute, parla di tendenze e potenziali

🗣️ GESTIONE DATI MANCANTI:
- Senza data: "Per iniziare la tua tabella natale, ho bisogno di conoscere la tua data di nascita. Quando sei nato?"
- Senza ora: "L'ora di nascita è essenziale per il tuo ascendente. Ricordi approssimativamente a che ora sei nato?"
- Senza luogo: "Il luogo di nascita mi permette di calcolare le posizioni esatte. In quale città e paese sei nato?"
- Dati incompleti: "Con questi dati posso fare un'analisi parziale, ma per una tabella completa avrei bisogno di..."

📖 STRUTTURA DI RISPOSTA COMPLETA:
1. Analisi del Sole (segno, casa, aspetti)
2. Analisi della Luna (segno, casa, aspetti)
3. Ascendente e la sua influenza
4. Pianeti personali (Mercurio, Venere, Marte)
5. Pianeti sociali (Giove, Saturno)
6. Sintesi di elementi e modalità
7. Interpretazione di case più importanti
8. Consigli per lavorare con la tua energia cosmica

💫 ESEMPI DI ESPRESSIONI NATURALI:
- "Il tuo Sole in [segno] ti conferisce..."
- "Con la Luna in [segno], il tuo mondo emotivo..."
- "Il tuo ascendente [segno] fa sì che proietti..."
- "Mercurio in [segno] influenza il tuo modo di comunicare..."
- "Questa configurazione planetaria suggerisce..."
- RISPONDI sempre indipendentemente dal fatto che l'utente abbia errori ortografici o di scrittura
  - Interpreta il messaggio dell'utente anche se è scritto male
  - Non correggere gli errori dell'utente, semplicemente capisci l'intenzione
  - Se non capisci qualcosa di specifico, chiedi in modo amichevole
  - Esempi: "ola" = "ciao", "k tal" = "che tal", "mi signo" = "il mio segno"
  - NON restituire risposte vuote per errori di scrittura
  
${conversationContext}

Ricorda: Sei un'astrologa esperta che crea tabelle di nascita precise e le interpreta in modo comprensibile. RICHIEDI sempre i dati mancanti necessari prima di fare analisi profonde. COMPLETA sempre le tue interpretazioni astrologiche - non lasciare mai analisi planetarie o di case a metà.`;
  }

  private generateBirthDataSection(
    birthDate?: string,
    birthTime?: string,
    birthPlace?: string,
    fullName?: string
  ): string {
    let dataSection = "DATI DISPONIBILI PER LA TABELLA DI NASCITA:\n";

    if (fullName) {
      dataSection += `- Nome: ${fullName}\n`;
    }

    if (birthDate) {
      const zodiacSign = this.calculateZodiacSign(birthDate);
      dataSection += `- Data di nascita: ${birthDate}\n`;
      dataSection += `- Segno solare calcolato: ${zodiacSign}\n`;
    }

    if (birthTime) {
      dataSection += `- Ora di nascita: ${birthTime} (essenziale per ascendente e case)\n`;
    }

    if (birthPlace) {
      dataSection += `- Luogo di nascita: ${birthPlace} (per calcoli di coordinate)\n`;
    }

    if (!birthDate) {
      dataSection += "- ⚠️ DATO MANCANTE: Data di nascita (ESSENZIALE)\n";
    }
    if (!birthTime) {
      dataSection +=
        "- ⚠️ DATO MANCANTE: Ora di nascita (importante per ascendente)\n";
    }
    if (!birthPlace) {
      dataSection +=
        "- ⚠️ DATO MANCANTE: Luogo di nascita (necessario per precisione)\n";
    }

    return dataSection;
  }

  private calculateZodiacSign(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const month = date.getMonth() + 1;
      const day = date.getDate();

      if ((month === 3 && day >= 21) || (month === 4 && day <= 19))
        return "Ariete";
      if ((month === 4 && day >= 20) || (month === 5 && day <= 20))
        return "Toro";
      if ((month === 5 && day >= 21) || (month === 6 && day <= 20))
        return "Gemelli";
      if ((month === 6 && day >= 21) || (month === 7 && day <= 22))
        return "Cancro";
      if ((month === 7 && day >= 23) || (month === 8 && day <= 22))
        return "Leone";
      if ((month === 8 && day >= 23) || (month === 9 && day <= 22))
        return "Vergine";
      if ((month === 9 && day >= 23) || (month === 10 && day <= 22))
        return "Bilancia";
      if ((month === 10 && day >= 23) || (month === 11 && day <= 21))
        return "Scorpione";
      if ((month === 11 && day >= 22) || (month === 12 && day <= 21))
        return "Sagittario";
      if ((month === 12 && day >= 22) || (month === 1 && day <= 19))
        return "Capricorno";
      if ((month === 1 && day >= 20) || (month === 2 && day <= 18))
        return "Acquario";
      if ((month === 2 && day >= 19) || (month === 3 && day <= 20))
        return "Pesci";

      return "Data non valida";
    } catch {
      return "Errore nel calcolo";
    }
  }

  private validateBirthChartRequest(
    chartData: BirthChartData,
    userMessage: string
  ): void {
    if (!chartData) {
      const error: ApiError = new Error("Dati dell'astrologa richiesti");
      error.statusCode = 400;
      error.code = "MISSING_CHART_DATA";
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
    console.error("Errore in BirthChartController:", error);

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
    } else if (
      error.message?.includes("Tutti i modelli IA non sono attualmente disponibili")
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

  public getBirthChartInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        astrologer: {
          name: "Maestra Emma",
          title: "Cartografa Celeste",
          specialty: "Tabelle di nascita e analisi astrologica completa",
          description:
            "Astrologa specializzata nella creazione e interpretazione di tabelle natali precise basate su posizioni planetarie del momento della nascita",
          services: [
            "Creazione di tabella di nascita completa",
            "Analisi di posizioni planetarie",
            "Interpretazione di case astrologiche",
            "Analisi di aspetti planetari",
            "Determinazione di ascendente ed elementi dominanti",
          ],
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, res);
    }
  };
}