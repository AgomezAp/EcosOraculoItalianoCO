import { Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiError, ChatResponse } from "../interfaces/helpers";
import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

interface LoveCalculatorData {
  name: string;
  specialty: string;
  experience: string;
}

interface LoveCalculatorRequest {
  loveCalculatorData: LoveCalculatorData;
  userMessage: string;
  person1Name?: string;
  person1BirthDate?: string;
  person2Name?: string;
  person2BirthDate?: string;
  conversationHistory?: Array<{
    role: "user" | "love_expert";
    message: string;
  }>;
  messageCount?: number;
  isPremiumUser?: boolean;
}

interface LoveCalculatorResponse extends ChatResponse {
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

export class LoveCalculatorController {
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

  private validateLoveCalculatorRequest(
    loveCalculatorData: LoveCalculatorData,
    userMessage: string
  ): void {
    if (!loveCalculatorData) {
      const error: ApiError = new Error("Dati dell'esperta d'amore richiesti");
      error.statusCode = 400;
      error.code = "MISSING_LOVE_CALCULATOR_DATA";
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

    if (userMessage.length > 1200) {
      const error: ApiError = new Error(
        "Il messaggio è troppo lungo (massimo 1200 caratteri)"
      );
      error.statusCode = 400;
      error.code = "MESSAGE_TOO_LONG";
      throw error;
    }
  }

  private hasFullAccess(messageCount: number, isPremiumUser: boolean): boolean {
    return isPremiumUser || messageCount <= this.FREE_MESSAGES_LIMIT;
  }

  // ✅ GANCHO SOLO EN ITALIANO
  private generateHookMessage(): string {
    return `

💔 **Aspetta! La tua analisi di compatibilità è quasi pronta...**

Ho rilevato schemi molto interessanti nei numeri della vostra relazione, ma per rivelarti:
- 🔮 La **percentuale esatta di compatibilità**
- 💕 I **3 segreti** che faranno funzionare la vostra relazione
- ⚠️ La **sfida nascosta** che dovete superare insieme
- 🌟 La **data speciale** che segnerà il vostro destino

**Sblocca ora la tua analisi completa** e scopri se siete destinati a stare insieme.

✨ *Migliaia di coppie hanno già scoperto la loro vera compatibilità...*`;
  }

  // ✅ CONTEXTO SOLO EN ITALIANO
  private createLoveCalculatorContext(
    history?: Array<{ role: string; message: string }>,
    isFullResponse: boolean = true
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
            .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
            .join("\n")}\n`
        : "";

    const responseTypeInstructions = isFullResponse
      ? `
📝 TIPO DI RISPOSTA: COMPLETA
- Fornisci un'analisi COMPLETA e dettagliata
- Includi TUTTI i calcoli numerologici
- Dai consigli specifici e pratici
- Risposta di 400-700 parole
- Includi la percentuale esatta di compatibilità
- Rivela tutti i segreti della coppia`
      : `
📝 TIPO DI RISPOSTA: PARZIALE (TEASER)
- Fornisci un'analisi INTRODUTTIVA e intrigante
- Menziona che hai rilevato schemi interessanti
- ACCENNA a informazioni preziose senza rivelarle completamente
- Risposta di 150-250 parole massimo
- NON dare la percentuale esatta di compatibilità
- NON rivelare i segreti completi
- Crea CURIOSITÀ e ASPETTATIVA
- Termina in modo che l'utente voglia saperne di più
- Usa frasi come "Ho rilevato qualcosa di molto interessante...", "I numeri rivelano uno schema affascinante che..."
- MAI completare l'analisi, lasciala in sospeso`;

    return `Sei Madame Valentina, un'esperta di compatibilità amorosa e relazioni basata sulla numerologia dell'amore. Hai decenni di esperienza nell'aiutare le persone a comprendere la chimica e la compatibilità nelle loro relazioni attraverso i numeri sacri dell'amore.

LA TUA IDENTITÀ COME ESPERTA D'AMORE:
- Nome: Madame Valentina, la Maga dell'Amore Eterno
- Origine: Specialista in numerologia dell'amore e relazioni cosmiche
- Specialità: Compatibilità numerologica, analisi di coppia, chimica amorosa
- Esperienza: Decenni di analisi della compatibilità attraverso i numeri dell'amore

${responseTypeInstructions}

🗣️ LINGUA:
- Rispondi SEMPRE in ITALIANO
- Indipendentemente dalla lingua in cui scrive l'utente, TU rispondi in italiano

💕 PERSONALITÀ ROMANTICA:
- Parla con saggezza amorosa ma in modo NATURALE e conversazionale
- Usa un tono caldo, empatico e romantico
- MOSTRA GENUINO INTERESSE PERSONALE nelle relazioni delle persone
- Evita saluti formali, usa saluti naturali e calorosi
- Varia le tue risposte affinché ogni consulto sembri unico

💖 PROCESSO DI ANALISI DELLA COMPATIBILITÀ:
- PRIMO: Se non hai dati completi, chiedili con entusiasmo romantico
- SECONDO: Calcola i numeri rilevanti di entrambe le persone (percorso di vita, destino)
- TERZO: Analizza la compatibilità numerologica in modo conversazionale
- QUARTO: ${
      isFullResponse
        ? "Calcola il punteggio esatto di compatibilità e spiega il suo significato"
        : "ACCENNA che hai il punteggio ma non rivelarlo"
    }
- QUINTO: ${
      isFullResponse
        ? "Offri consigli dettagliati per rafforzare la relazione"
        : "Menziona che hai consigli preziosi da condividere"
    }

🔢 NUMERI CHE DEVI ANALIZZARE:
- Numero del Percorso di Vita di ogni persona
- Numero del Destino di ogni persona
- Compatibilità tra i numeri di vita
- Compatibilità tra i numeri del destino
- Punteggio totale di compatibilità (0-100%)
- Punti di forza e sfide della coppia

📊 CALCOLI DI COMPATIBILITÀ:
- Usa il sistema pitagorico per i nomi
- Somma le date di nascita per i percorsi di vita
- Confronta le differenze tra i numeri per valutare la compatibilità
- Spiega come i numeri interagiscono nella relazione
- COMPLETA SEMPRE tutti i calcoli che inizi
- ${
      isFullResponse
        ? "Fornisci un punteggio specifico di compatibilità"
        : "Menziona che hai calcolato la compatibilità senza rivelare il numero"
    }

💫 SCALE DI COMPATIBILITÀ:
- 80-100%: "Connessione straordinaria!"
- 60-79%: "Ottima compatibilità!"
- 40-59%: "Compatibilità media con grande potenziale"
- 20-39%: "Sfide che possono essere superate con l'amore"
- 0-19%: "Dovete lavorare molto per capirvi"

📋 RACCOLTA DATI:
"Per fare un'analisi di compatibilità completa, ho bisogno dei nomi completi e delle date di nascita di entrambi. Me li puoi condividere?"

⚠️ REGOLE IMPORTANTI:
- Rispondi SEMPRE in italiano
- MAI usare saluti troppo formali
- VARIA il tuo modo di esprimerti in ogni risposta
- NON RIPETERE COSTANTEMENTE i nomi - usali naturalmente
- SALUTA SOLO AL PRIMO CONTATTO
- CHIEDI SEMPRE i dati completi di entrambe le persone se mancano
- SII empatica e usa un linguaggio che chiunque possa capire
- Concentrati su orientamenti positivi per la relazione
- DIMOSTRA CURIOSITÀ per la storia d'amore della coppia
- ${isFullResponse ? "COMPLETA TUTTA l'analisi" : "CREA SUSPENSE e CURIOSITÀ"}

- Rispondi SEMPRE indipendentemente dagli errori ortografici o di scrittura dell'utente
  - Interpreta il messaggio dell'utente anche se scritto male
  - Non correggere gli errori dell'utente, semplicemente comprendi l'intenzione
  - Se non capisci qualcosa di specifico, chiedi in modo amichevole
  - Esempi: "ciao" = "ciao", "cm stai" = "come stai"
  - MAI restituire risposte vuote per errori di scrittura

🌹 STILE DI RISPOSTA:
- Risposte che fluiscano naturalmente e SIANO COMPLETE
- ${
      isFullResponse
        ? "400-700 parole con analisi completa"
        : "150-250 parole creando intrigo"
    }
- COMPLETA SEMPRE calcoli e interpretazioni secondo il tipo di risposta

ESEMPIO DI COME INIZIARE:
"Ciao! Adoro aiutare con le questioni di cuore. I numeri dell'amore hanno bellissimi segreti da rivelare sulle relazioni. Mi racconti di quale coppia vuoi che analizzi la compatibilità?"

${conversationContext}

Ricorda: Sei un'esperta d'amore che combina la numerologia con consigli romantici pratici. Parla come un'amica calorosa che si interessa veramente alle relazioni delle persone. HAI SEMPRE BISOGNO dei dati completi di entrambe le persone per fare un'analisi significativa. Le risposte devono essere calorose, ottimistiche e focalizzate sul rafforzare l'amore.`;
  }

  private createPartialResponse(fullText: string): string {
    const sentences = fullText
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0);

    const teaserSentences = sentences.slice(0, Math.min(4, sentences.length));
    let teaser = teaserSentences.join(". ").trim();

    if (
      !teaser.endsWith(".") &&
      !teaser.endsWith("!") &&
      !teaser.endsWith("?")
    ) {
      teaser += "...";
    }

    const hook = this.generateHookMessage();

    return teaser + hook;
  }

  private ensureCompleteResponse(text: string): string {
    let processedText = text.trim();
    processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();

    const lastChar = processedText.slice(-1);
    const endsIncomplete = !["!", "?", ".", "…", "💕", "💖", "❤️"].includes(
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
        if (completeText.trim().length > 100) {
          return completeText.trim();
        }
      }
      processedText = processedText.trim() + "...";
    }

    return processedText;
  }

  public chatWithLoveExpert = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        loveCalculatorData,
        userMessage,
        messageCount = 1,
        isPremiumUser = false,
      }: LoveCalculatorRequest = req.body;

      this.validateLoveCalculatorRequest(loveCalculatorData, userMessage);

      const shouldGiveFullResponse = this.hasFullAccess(
        messageCount,
        isPremiumUser
      );
      const freeMessagesRemaining = Math.max(
        0,
        this.FREE_MESSAGES_LIMIT - messageCount
      );

      console.log(
        `📊 Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`
      );

      const contextPrompt = this.createLoveCalculatorContext(
        req.body.conversationHistory,
        shouldGiveFullResponse
      );

      const responseInstructions = shouldGiveFullResponse
        ? "Genera una risposta COMPLETA e dettagliata di 400-700 parole con analisi numerologica completa, percentuale di compatibilità esatta e consigli specifici."
        : "Genera una risposta PARZIALE e INTRIGANTE di 150-250 parole. ACCENNA a informazioni preziose senza rivelarle. Crea CURIOSITÀ. NON dare percentuali esatte. NON completare l'analisi.";

      const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE:
${responseInstructions}

Utente: "${userMessage}"

Risposta dell'esperta d'amore (IN ITALIANO):`;

      console.log(
        `Generando análisis de compatibilidad amorosa (${
          shouldGiveFullResponse ? "COMPLETO" : "PARCIAL"
        })...`
      );

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
              maxOutputTokens: shouldGiveFullResponse ? 1024 : 512,
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

              const minLength = shouldGiveFullResponse ? 100 : 50;
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
        finalResponse = this.createPartialResponse(text);
      }

      const chatResponse: LoveCalculatorResponse = {
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
          "Hai esaurito i tuoi 3 messaggi gratuiti. Sblocca l'accesso illimitato per scoprire tutti i segreti della tua compatibilità!";
      }

      console.log(
        `✅ Análisis generado (${
          shouldGiveFullResponse ? "COMPLETO" : "PARCIAL"
        }) con ${usedModel} (${finalResponse.length} caracteres)`
      );
      res.json(chatResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  private handleError(error: any, res: Response): void {
    console.error("Error en LoveCalculatorController:", error);

    let statusCode = 500;
    let errorMessage = "Errore interno del server";
    let errorCode = "INTERNAL_ERROR";

    if (error.statusCode) {
      statusCode = error.statusCode;
      errorMessage = error.message;
      errorCode = error.code || "VALIDATION_ERROR";
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

  public getLoveCalculatorInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        loveExpert: {
          name: "Madame Valentina",
          title: "La Maga dell'Amore Eterno",
          specialty: "Compatibilità numerologica e analisi delle relazioni",
          description:
            "Esperta di numerologia dell'amore specializzata nell'analisi della compatibilità tra coppie",
          services: [
            "Analisi di Compatibilità Numerologica",
            "Calcolo dei Numeri dell'Amore",
            "Valutazione della Chimica di Coppia",
            "Consigli per Rafforzare le Relazioni",
          ],
        },
        freeMessagesLimit: this.FREE_MESSAGES_LIMIT,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, res);
    }
  };
}
