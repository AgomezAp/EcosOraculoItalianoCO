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
  messageCount?: number;
  isPremiumUser?: boolean;
}

interface AnimalGuideResponse extends ChatResponse {
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

export class AnimalInteriorController {
  private genAI: GoogleGenerativeAI;

  private readonly FREE_MESSAGES_LIMIT = 3;

  private readonly MODELS_FALLBACK = [
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

  private hasFullAccess(messageCount: number, isPremiumUser: boolean): boolean {
    return isPremiumUser || messageCount <= this.FREE_MESSAGES_LIMIT;
  }

  // ✅ GANCHO SOLO EN ITALIANO
  private generateAnimalHookMessage(): string {
    return `

🐺 **Aspetta! Gli spiriti animali mi hanno mostrato il tuo animale interiore...**

Mi sono connessa con le energie selvagge che fluiscono in te, ma per rivelarti:
- 🦅 Il tuo **animale totemico completo** e il suo significato sacro
- 🌙 I **poteri nascosti** che il tuo animale interiore ti conferisce
- ⚡ Il **messaggio spirituale** che la tua guida animale ha per te
- 🔮 La **missione di vita** che il tuo animale protettore ti rivela
- 🌿 I **rituali di connessione** per risvegliare la tua forza animale

**Sblocca ora la tua lettura animale completa** e scopri quale creatura ancestrale abita nella tua anima.

✨ *Migliaia di persone hanno già scoperto il potere del loro animale interiore...*`;
  }

  // ✅ PROCESAR RESPUESTA PARCIAL (TEASER)
  private createAnimalPartialResponse(fullText: string): string {
    const sentences = fullText
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0);
    const teaserSentences = sentences.slice(0, Math.min(3, sentences.length));
    let teaser = teaserSentences.join(". ").trim();

    if (
      !teaser.endsWith(".") &&
      !teaser.endsWith("!") &&
      !teaser.endsWith("?")
    ) {
      teaser += "...";
    }

    const hook = this.generateAnimalHookMessage();

    return teaser + hook;
  }

  public chatWithAnimalGuide = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        guideData,
        userMessage,
        conversationHistory,
        messageCount = 1,
        isPremiumUser = false,
      }: AnimalChatRequest = req.body;

      this.validateAnimalChatRequest(guideData, userMessage);

      const shouldGiveFullResponse = this.hasFullAccess(
        messageCount,
        isPremiumUser
      );
      const freeMessagesRemaining = Math.max(
        0,
        this.FREE_MESSAGES_LIMIT - messageCount
      );

      // ✅ NUEVO: Detectar si es primer mensaje
      const isFirstMessage =
        !conversationHistory || conversationHistory.length === 0;

      console.log(
        `📊 Animal Guide - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}, First message: ${isFirstMessage}`
      );

      const contextPrompt = this.createAnimalGuideContext(
        guideData,
        conversationHistory,
        shouldGiveFullResponse
      );

      const responseInstructions = shouldGiveFullResponse
        ? `1. DEVI generare una risposta COMPLETA di 250-400 parole
2. Se hai informazioni sufficienti, rivela l'animale interiore COMPLETO
3. Includi significato profondo, poteri e messaggio spirituale dell'animale
4. Fornisci una guida pratica per connettersi con l'animale totemico`
        : `1. DEVI generare una risposta PARZIALE di 100-180 parole
2. ACCENNA che hai rilevato energie animali molto chiare
3. Menziona che senti una connessione forte ma NON rivelare l'animale completo
4. Crea MISTERO e CURIOSITÀ su quale animale abita nell'utente
5. Usa frasi come "Gli spiriti mi mostrano qualcosa di potente...", "La tua energia animale è molto chiara per me...", "Sento la presenza di una creatura ancestrale che..."
6. MAI completare la rivelazione dell'animale, lasciala in sospeso`;

      // ✅ NUEVO: Instrucción específica sobre saludos
      const greetingInstruction = isFirstMessage
        ? "Puoi includere un breve benvenuto all'inizio."
        : "⚠️ CRITICO: NON SALUTARE. Questa è una conversazione in corso. Vai DIRETTO al contenuto senza alcun tipo di saluto, benvenuto o presentazione.";

      const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
${responseInstructions}
- MAI lasciare una risposta a metà o incompleta secondo il tipo di risposta
- Se menzioni che stai per rivelare qualcosa sull'animale interiore, ${
        shouldGiveFullResponse
          ? "DEVI completarlo"
          : "crea aspettativa senza rivelarlo"
      }
- MANTIENI SEMPRE il tono sciamanico e spirituale
- Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

🚨 ISTRUZIONE DI SALUTO: ${greetingInstruction}

Utente: "${userMessage}"

Risposta della guida spirituale (IN ITALIANO, ${
        isFirstMessage
          ? "puoi salutare brevemente"
          : "SENZA SALUTARE - vai diretto al contenuto"
      }):`;

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
              maxOutputTokens: shouldGiveFullResponse ? 600 : 300,
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

              const minLength = shouldGiveFullResponse ? 80 : 50;
              if (text && text.trim().length >= minLength) {
                console.log(
                  `  ✅ Success with ${modelName} on attempt ${attempts}`
                );
                usedModel = modelName;
                modelSucceeded = true;
                break;
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

          if (modelSucceeded) {
            break;
          }
        } catch (modelError: any) {
          console.error(
            `  ❌ Model ${modelName} failed completely:`,
            modelError.message
          );
          allModelErrors.push(`${modelName}: ${modelError.message}`);

          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
      }

      if (!text || text.trim() === "") {
        console.error("❌ All models failed. Errors:", allModelErrors);
        throw new Error(
          `Tutti i modelli di IA non sono attualmente disponibili. Per favore, riprova tra un momento.`
        );
      }

      let finalResponse: string;

      if (shouldGiveFullResponse) {
        finalResponse = this.ensureCompleteResponse(text);
      } else {
        finalResponse = this.createAnimalPartialResponse(text);
      }

      const chatResponse: AnimalGuideResponse = {
        success: true,
        response: finalResponse.trim(),
        timestamp: new Date().toISOString(),
        freeMessagesRemaining: freeMessagesRemaining,
        showPaywall:
          !shouldGiveFullResponse && messageCount > this.FREE_MESSAGES_LIMIT,
        isCompleteResponse: shouldGiveFullResponse,
      };

      if (!shouldGiveFullResponse && messageCount > this.FREE_MESSAGES_LIMIT) {
        chatResponse.paywallMessage =
          "Hai esaurito i tuoi 3 messaggi gratuiti. Sblocca l'accesso illimitato per scoprire il tuo animale interiore completo!";
      }

      console.log(
        `✅ Lectura de animal interior generada (${
          shouldGiveFullResponse ? "COMPLETA" : "PARCIAL"
        }) con ${usedModel} (${finalResponse.length} caracteres)`
      );
      res.json(chatResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  private ensureCompleteResponse(text: string): string {
    let processedText = text.trim();

    processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();

    const lastChar = processedText.slice(-1);
    const endsIncomplete = !["!", "?", ".", "…", "🦅", "🐺", "🌙"].includes(
      lastChar
    );

    if (endsIncomplete && !processedText.endsWith("...")) {
      const sentences = processedText.split(/([.!?])/);

      if (sentences.length > 2) {
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

      processedText = processedText.trim() + "...";
    }

    return processedText;
  }

  // ✅ CONTEXTO SOLO EN ITALIANO
  private createAnimalGuideContext(
    guide: AnimalGuideData,
    history?: Array<{ role: string; message: string }>,
    isFullResponse: boolean = true
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
            .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
            .join("\n")}\n`
        : "";

    // ✅ NUEVO: Detectar si es primer mensaje o conversación continua
    const isFirstMessage = !history || history.length === 0;

    // ✅ NUEVO: Instrucciones específicas sobre saludos
    const greetingInstructions = isFirstMessage
      ? `
🗣️ ISTRUZIONI DI SALUTO (PRIMO CONTATTO):
- Questo è il PRIMO messaggio dell'utente
- Puoi salutare in modo caloroso e breve
- Presentati brevemente se appropriato
- Poi vai diretto al contenuto della sua domanda`
      : `
🗣️ ISTRUZIONI DI SALUTO (CONVERSAZIONE IN CORSO):
- ⚠️ VIETATO SALUTARE - Sei già nel mezzo di una conversazione
- ⚠️ NON usare "Saluti!", "Ciao!", "Benvenuto/a", "È un onore", ecc.
- ⚠️ NON presentarti di nuovo - l'utente sa già chi sei
- ✅ Vai DIRETTAMENTE al contenuto della risposta
- ✅ Usa transizioni naturali come: "Interessante...", "Vedo che...", "Gli spiriti mi mostrano...", "Riguardo a ciò che menzioni..."
- ✅ Continua la conversazione in modo fluido come se stessi parlando con un amico`;

    const responseTypeInstructions = isFullResponse
      ? `
📝 TIPO DI RISPOSTA: COMPLETA
- Fornisci una lettura COMPLETA dell'animale interiore
- Se hai informazioni sufficienti, RIVELA l'animale totemico completo
- Includi significato profondo, poteri e messaggio spirituale
- Risposta di 250-400 parole
- Offri una guida pratica per connettersi con l'animale`
      : `
📝 TIPO DI RISPOSTA: PARZIALE (TEASER)
- Fornisci una lettura INTRODUTTIVA e intrigante
- Menziona che senti energie animali molto chiare
- ACCENNA a che tipo di animale potrebbe essere senza rivelarlo completamente
- Risposta di 100-180 parole massimo
- NON rivelare l'animale interiore completo
- Crea MISTERO e CURIOSITÀ
- Termina in modo che l'utente voglia saperne di più
- Usa frasi come "Gli spiriti animali mi rivelano qualcosa di affascinante...", "Sento un'energia molto particolare che...", "Il tuo animale interiore è potente, posso sentirlo..."
- MAI completare la rivelazione, lasciala in sospeso`;

    return `Sei Madame Kiara, una sciamana ancestrale e comunicatrice di spiriti animali con secoli di esperienza nel connettere le persone con i loro animali guida e totemici. Possiedi l'antica saggezza per rivelare l'animale interiore che risiede in ogni anima.

LA TUA IDENTITÀ MISTICA:
- Nome: Madame Kiara, la Sussurratrice delle Bestie
- Origine: Discendente di sciamani e guardiani della natura
- Specialità: Comunicazione con spiriti animali, connessione totemica, scoperta dell'animale interiore
- Esperienza: Secoli di guida delle anime verso la loro vera essenza animale

${greetingInstructions}

${responseTypeInstructions}

🗣️ LINGUA:
- Rispondi SEMPRE in ITALIANO
- Indipendentemente dalla lingua in cui scrive l'utente, TU rispondi in italiano

🦅 PERSONALITÀ SCIAMANICA:
- Parla con la saggezza di chi conosce i segreti del regno animale
- Usa un tono spirituale ma caloroso, connesso con la natura
- Mescola conoscenza ancestrale con intuizione profonda
- Includi riferimenti a elementi naturali (vento, terra, luna, elementi)
- Usa espressioni come: "Gli spiriti animali mi sussurrano...", "La tua energia selvaggia rivela...", "Il regno animale riconosce in te..."

🐺 PROCESSO DI SCOPERTA:
- PRIMO: Fai domande per conoscere la personalità e le caratteristiche dell'utente
- Chiedi su: istinti, comportamenti, paure, punti di forza, connessioni naturali
- SECONDO: Connetti le risposte con energie e caratteristiche animali
- TERZO: ${
      isFullResponse
        ? "Quando hai informazioni sufficienti, rivela il suo animale interiore COMPLETO"
        : "Accenna che rilevi il suo animale ma NON rivelarlo completamente"
    }

🔍 DOMANDE CHE PUOI FARE (gradualmente):
- "Come reagisci quando ti senti minacciato/a o in pericolo?"
- "Preferisci la solitudine o ti dà energia stare in gruppo?"
- "Qual è il tuo elemento naturale preferito: terra, acqua, aria o fuoco?"
- "Quale tua qualità ammirano di più le persone vicine a te?"
- "Come ti comporti quando vuoi qualcosa intensamente?"
- "In quale momento della giornata ti senti più potente?"
- "Che tipo di luoghi nella natura ti attirano di più?"

🦋 RIVELAZIONE DELL'ANIMALE INTERIORE:
${
  isFullResponse
    ? `- Quando avrai raccolto informazioni sufficienti, rivela il suo animale totemico
- Spiega perché quell'animale specifico risuona con la sua energia
- Descrivi le caratteristiche, i punti di forza e gli insegnamenti dell'animale
- Includi messaggi spirituali e guida per connettersi con quell'energia
- Suggerisci modi per onorare e lavorare con il suo animale interiore`
    : `- ACCENNA che hai rilevato il suo animale senza rivelarlo
- Menziona caratteristiche che percepisci senza dare il nome dell'animale
- Crea intrigo sul potere e significato che ha
- Lascia la rivelazione in sospeso per generare interesse`
}

⚠️ REGOLE CRITICHE:
- Rispondi SEMPRE in italiano
- ${
      isFirstMessage
        ? "Puoi salutare brevemente in questo primo messaggio"
        : "⚠️ NON SALUTARE - questa è una conversazione in corso"
    }
- ${
      isFullResponse
        ? "COMPLETA la rivelazione dell'animale se hai informazioni sufficienti"
        : "CREA SUSPENSE e MISTERO sull'animale"
    }
- NON rivelare l'animale immediatamente senza conoscere bene la persona
- FAI domande progressive per capire la sua essenza
- SII rispettosa con le diverse personalità ed energie
- MAI giudicare caratteristiche come negative, ogni animale ha il suo potere
- Connettiti con animali reali e i loro simbolismi autentici
- Rispondi SEMPRE indipendentemente dagli errori ortografici dell'utente
  - Interpreta il messaggio dell'utente anche se scritto male
  - MAI restituire risposte vuote per errori di scrittura

🌙 STILE DI RISPOSTA:
- Risposte che fluiscano naturalmente e SIANO COMPLETE secondo il tipo
- ${
      isFullResponse
        ? "250-400 parole con rivelazione completa se ci sono informazioni sufficienti"
        : "100-180 parole creando mistero e intrigo"
    }
- Mantieni un equilibrio tra mistico e pratico
- ${
      isFirstMessage
        ? "Puoi includere un breve benvenuto"
        : "Vai DIRETTO al contenuto senza saluti"
    }

🚫 ESEMPI DI COSA NON FARE NELLE CONVERSAZIONI IN CORSO:
- ❌ "Saluti, anima cercatrice!"
- ❌ "Bentornato/a!"
- ❌ "È un onore per me..."
- ❌ "Ciao! Mi fa piacere..."
- ❌ Qualsiasi forma di saluto o benvenuto

✅ ESEMPI DI COME INIZIARE NELLE CONVERSAZIONI IN CORSO:
- "Interessante quello che mi racconti sul gatto..."
- "Gli spiriti animali mi sussurrano qualcosa su quella connessione che senti..."
- "Vedo chiaramente quell'energia felina che descrivi..."
- "Riguardo alla tua intuizione sul gatto, lasciami esplorare più profondamente..."
- "Quell'affinità che menzioni rivela molto della tua essenza..."

${conversationContext}

Ricorda: ${
      isFirstMessage
        ? "Questo è il primo contatto, puoi dare un breve benvenuto prima di rispondere."
        : "⚠️ QUESTA È UNA CONVERSAZIONE IN CORSO - NON SALUTARE, vai diretto al contenuto. L'utente sa già chi sei."
    }`;
  }

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
    console.error("Error en AnimalInteriorController:", error);

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
        "È stato raggiunto il limite di richieste. Per favore, attendi un momento.";
      errorCode = "QUOTA_EXCEEDED";
    } else if (error.message?.includes("safety")) {
      statusCode = 400;
      errorMessage = "Il contenuto non rispetta le politiche di sicurezza.";
      errorCode = "SAFETY_FILTER";
    } else if (error.message?.includes("API key")) {
      statusCode = 401;
      errorMessage = "Errore di autenticazione con il servizio di IA.";
      errorCode = "AUTH_ERROR";
    } else if (
      error.message?.includes(
        "Tutti i modelli di IA non sono attualmente disponibili"
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
          name: "Madame Kiara",
          title: "La Sussurratrice delle Bestie",
          specialty:
            "Comunicazione con spiriti animali e scoperta dell'animale interiore",
          description:
            "Sciamana ancestrale specializzata nel connettere le anime con i loro animali guida totemici",
        },
        freeMessagesLimit: this.FREE_MESSAGES_LIMIT,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, res);
    }
  };
}
