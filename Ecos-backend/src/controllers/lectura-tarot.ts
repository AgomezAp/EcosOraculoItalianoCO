import { Request, Response } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { ApiError, ChatRequest, ChatResponse } from "../interfaces/helpers";

interface AnimalGuideData {
  name: string;
  specialty: string;
  experience: string;
}

interface AnimalChatRequest {
  guideData: AnimalGuideData;
  userMessage: string;
  conversationHistory?: Array<{
    role: "user" | "guide";
    message: string;
  }>;
}

export class AnimalInteriorController {
  private genAI: GoogleGenerativeAI;

  // ✅ LISTA DI MODELLI DI BACKUP (in ordine di preferenza)
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

  public chatWithAnimalGuide = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { guideData, userMessage, conversationHistory }: AnimalChatRequest =
        req.body;

      // Convalidare input
      this.validateAnimalChatRequest(guideData, userMessage);

      const contextPrompt = this.createAnimalGuideContext(
        guideData,
        conversationHistory
      );

      const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
1. DEVI generare una risposta COMPLETA tra 150-300 parole
2. NON lasciare mai una risposta a metà o incompleta
3. Se menzioni che rivelerai qualcosa sull'animale interiore, DEVI completarlo
4. Ogni risposta DEVE terminare con una conclusione chiara e un punto finale
5. Se rilevi che la tua risposta si sta tagliando, finalizza l'idea attuale con coerenza
6. MANTIENI SEMPRE il tono sciamanico e spirituale nella lingua rilevata dell'utente
7. Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta della guida spirituale (assicurati di completare TUTTA la tua guida prima di terminare):`;

      console.log(`Generando lettura di animale interiore...`);

      // ✅ SISTEMA DI FALLBACK: Prova con più modelli
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
              maxOutputTokens: 512,
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

          // ✅ RIPROVI per ogni modello (nel caso sia temporaneamente sovraccarico)
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

              // ✅ Valida che la risposta non sia vuota e abbia lunghezza minima
              if (text && text.trim().length >= 80) {
                console.log(
                  `  ✅ Success with ${modelName} on attempt ${attempts}`
                );
                usedModel = modelName;
                modelSucceeded = true;
                break; // Esci dal while di riprovi
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

          // Se questo modello ha avuto successo, esci dal loop dei modelli
          if (modelSucceeded) {
            break;
          }
        } catch (modelError: any) {
          console.error(
            `  ❌ Model ${modelName} failed completely:`,
            modelError.message
          );
          allModelErrors.push(`${modelName}: ${modelError.message}`);

          // Aspetta un po' prima di provare con il prossimo modello
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

      // ✅ ASSICURA RISPOSTA COMPLETA E BENE FORMATTA
      text = this.ensureCompleteResponse(text);

      // ✅ Validazione aggiuntiva di lunghezza minima
      if (text.trim().length < 80) {
        throw new Error("Risposta generata troppo corta");
      }

      const chatResponse: ChatResponse = {
        success: true,
        response: text.trim(),
        timestamp: new Date().toISOString(),
      };

      console.log(
        `✅ Lettura di animale interiore generata con successo con ${usedModel} (${text.length} caratteri)`
      );
      res.json(chatResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  // ✅ METODO MIGLIORATO PER ASSICURARE RISPOSTE COMPLETE
  private ensureCompleteResponse(text: string): string {
    let processedText = text.trim();

    // Rimuovi possibili marcatori di codice o formato incompleto
    processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();

    const lastChar = processedText.slice(-1);
    const endsIncomplete = !["!", "?", ".", "…", "🦅", "🐺", "🌙"].includes(
      lastChar
    );

    if (endsIncomplete && !processedText.endsWith("...")) {
      // Cerca l'ultima frase completa
      const sentences = processedText.split(/([.!?])/);

      if (sentences.length > 2) {
        // Ricostruisci fino all'ultima frase completa
        let completeText = "";
        for (let i = 0; i < sentences.length - 1; i += 2) {
          if (sentences[i].trim()) {
            completeText += sentences[i] + (sentences[i + 1] || ".");
          }
        }

        if (completeText.trim().length > 80) {
          return completeText.trim();
        }
      }

      // Se non si può trovare una frase completa, aggiungi chiusura appropriata
      processedText = processedText.trim() + "...";
    }

    return processedText;
  }

  // Metodo per creare il contesto della guida di animali spirituali
  private createAnimalGuideContext(
    guide: AnimalGuideData,
    history?: Array<{ role: string; message: string }>
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
            .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
            .join("\n")}\n`
        : "";

    return `Sei Maestra Kiara, una sciamana ancestrale e comunicatrice di spiriti animali con secoli di esperienza nel collegare le persone con i loro animali guida e totemici. Possiedi la saggezza antica per rivelare l'animale interiore che risiede in ogni anima.

LA TUA IDENTITÀ MISTICA:
- Nome: Maestra Kiara, la Sussurratrice di Bestie
- Origine: Discendente di sciamani e guardiani della natura
- Specialità: Comunicazione con spiriti animali, connessione totemica, scoperta dell'animale interiore
- Esperienza: Secoli guidando anime verso la loro vera essenza animale

🌍 ADATTAMENTO LINGUISTICO:
- RILEVA automaticamente la lingua in cui l'utente ti scrive
- RISPONDI sempre nella stessa lingua utilizzata dall'utente
- MANTIENI la tua personalità sciamanica in qualsiasi lingua
- Lingue principali: Italiano, Inglese, Portoghese, Francese, Spagnolo
- Se rilevi un'altra lingua, fai del tuo meglio per rispondere in quella lingua
- NON cambiare lingua a meno che l'utente non lo faccia per primo


COME DEVI COMPORTARTI:

🦅 PERSONALITÀ SCIAMANICA:
- Parla con la saggezza di chi conosce i segreti del regno animale
- Usa un tono spirituale ma caldo, connesso con la natura
- Mescola conoscenza ancestrale con intuizione profonda
- Includi riferimenti a elementi naturali (vento, terra, luna, elementi)

🐺 PROCESSO DI SCOPERTA:
- PRIMO: Fai domande per conoscere la personalità e le caratteristiche dell'utente
- Chiedi su: istinti, comportamenti, paure, forze, connessioni naturali
- SECONDO: Collega le risposte con energie e caratteristiche animali
- TERZO: Quando hai abbastanza informazioni, rivela il suo animale interiore

🔍 DOMANDE CHE DEVI FARE (gradualmente):
- "Come reagisci quando ti senti minacciato o in pericolo?"
- "Preferisci la solitudine o ti energizza stare in gruppo?"
- "Qual è il tuo elemento naturale favorito: terra, acqua, aria o fuoco?"
- "Quale qualità tua ammirano di più le persone vicine?"
- "Come ti comporti quando vuoi qualcosa intensamente?"
- "In quale momento della giornata ti senti più potente?"
- "Quali tipi di luoghi nella natura ti attirano di più?"

🦋 RIVELAZIONE DELL'ANIMALE INTERIORE:
- Quando hai raccolto abbastanza informazioni, rivela il suo animale totemico
- Spiega perché quell'animale specifico risuona con la sua energia
- Descrivi le caratteristiche, forze e insegnamenti dell'animale
- Includi messaggi spirituali e guida per connettersi con quella energia
- Suggerisci modi per onorare e lavorare con il suo animale interiore

🌙 STILE DI RISPOSTA:
- Usa espressioni come: "Gli spiriti animali mi sussurrano...", "La tua energia selvaggia rivela...", "Il regno animale riconosce in te..."
- Mantieni un equilibrio tra mistico e pratico
- Risposte di 150-300 parole che fluiscano naturalmente e SIANO COMPLETE
- COMPLETA SEMPRE i tuoi pensieri
⚠️ REGOLE IMPORTANTI:
- RILEVA E RISPONDI nella lingua dell'utente automaticamente
- NON rivelare l'animale immediatamente, hai bisogno di conoscere bene la persona
- FAI domande progressive per capire la sua essenza
- SI rispettoso con le diverse personalità e energie
- NON giudicare caratteristiche come negative, ogni animale ha il suo potere
- Connetti con animali reali e i loro simbolismi autentici
- MANTIENI la tua personalità sciamanica indipendentemente dalla lingua
- RISPONDI SEMPRE indipendentemente se l'utente ha errori ortografici o di scrittura
  - Interpreta il messaggio dell'utente anche se è scritto male
  - Non correggere gli errori dell'utente, semplicemente capisci l'intenzione
  - Se non capisci qualcosa di specifico, chiedi in modo amichevole
  - Esempi: "ola" = "ciao", "k tal" = "che tal", "mi signo" = "mi segno"
  - NON restituire risposte vuote per errori di scrittura

${conversationContext}

Ricorda: Sei una guida spirituale che aiuta le persone a scoprire e connettersi con il loro animale interiore. Completa sempre le tue letture e orientamenti, adattandoti perfettamente alla lingua dell'utente.`;
  }

  // Convalida della richiesta per guida di animale interiore
  private validateAnimalChatRequest(
    guideData: AnimalGuideData,
    userMessage: string
  ): void {
    if (!guideData) {
      const error: ApiError = new Error(
        "Dati della guida spirituale richiesti"
      );
      error.statusCode = 400;
      error.code = "MISSING_GUIDE_DATA";
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
    console.error("Errore in AnimalInteriorController:", error);

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
        "È stato raggiunto il limite di query. Per favore, aspetta un momento.";
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
      error.message?.includes(
        "Tutti i modelli IA non sono attualmente disponibili"
      )
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

  public getAnimalGuideInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        guide: {
          name: "Maestra Kiara",
          title: "Sussurratrice di Bestie",
          specialty:
            "Comunicazione con spiriti animali e scoperta dell'animale interiore",
          description:
            "Sciamana ancestrale specializzata nel collegare anime con i loro animali guida totemici",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, res);
    }
  };
}
