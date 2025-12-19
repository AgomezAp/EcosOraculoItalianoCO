import { Request, Response } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";

// Interfaces
interface VocationalData {
  name: string;
  specialty: string;
  experience: string;
}

interface VocationalRequest {
  vocationalData: VocationalData;
  userMessage: string;
  personalInfo?: {
    age?: number;
    currentEducation?: string;
    workExperience?: string;
    interests?: string[];
  };
  assessmentAnswers?: Array<{
    question: string;
    answer: string;
    category: string;
  }>;
  conversationHistory?: Array<{
    role: "user" | "counselor";
    message: string;
  }>;
  messageCount?: number;
  isPremiumUser?: boolean;
}

interface VocationalResponse {
  success: boolean;
  response?: string;
  error?: string;
  code?: string;
  timestamp?: string;
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export class VocationalController {
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
  private generateVocationalHookMessage(): string {
    return `

🎯 **Aspetta! Il tuo profilo vocazionale è quasi completo...**

Basandomi sulla nostra conversazione, ho identificato schemi molto chiari sulla tua vocazione, ma per rivelarti:
- 🎓 Le **3 carriere ideali** che coincidono perfettamente con il tuo profilo
- 💼 Il **campo lavorativo con maggiore proiezione** per le tue competenze
- 📈 Il **piano d'azione personalizzato** passo dopo passo per il tuo successo
- 🔑 Le **competenze chiave** che devi sviluppare per distinguerti
- 💰 La **fascia salariale prevista** nelle carriere consigliate

**Sblocca ora il tuo orientamento vocazionale completo** e scopri il percorso professionale che trasformerà il tuo futuro.

✨ *Migliaia di persone hanno già trovato la loro vocazione ideale con la nostra guida...*`;
  }

  // ✅ PROCESAR RESPUESTA PARCIAL (TEASER)
  private createVocationalPartialResponse(fullText: string): string {
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

    const hook = this.generateVocationalHookMessage();

    return teaser + hook;
  }

  // Método principal para chat con consejero vocacional
  public chatWithCounselor = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        vocationalData,
        userMessage,
        messageCount = 1,
        isPremiumUser = false,
      }: VocationalRequest = req.body;

      this.validateVocationalRequest(vocationalData, userMessage);

      const shouldGiveFullResponse = this.hasFullAccess(
        messageCount,
        isPremiumUser
      );
      const freeMessagesRemaining = Math.max(
        0,
        this.FREE_MESSAGES_LIMIT - messageCount
      );

      console.log(
        `📊 Vocational - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`
      );

      const contextPrompt = this.createVocationalContext(
        req.body.conversationHistory,
        shouldGiveFullResponse
      );

      const responseInstructions = shouldGiveFullResponse
        ? `1. DEVI generare una risposta COMPLETA di 250-400 parole
2. Includi un'analisi COMPLETA del profilo vocazionale
3. Suggerisci carriere specifiche con giustificazione
4. Fornisci passi concreti d'azione
5. Offri orientamento pratico e dettagliato`
        : `1. DEVI generare una risposta PARZIALE di 100-180 parole
2. ACCENNA che hai identificato schemi vocazionali chiari
3. Menziona che hai raccomandazioni specifiche ma NON rivelarle completamente
4. Crea INTERESSE e CURIOSITÀ sulle carriere ideali
5. Usa frasi come "Vedo uno schema interessante nel tuo profilo...", "Le tue risposte rivelano competenze che si adattano perfettamente a...", "Rilevo un'inclinazione chiara verso..."
6. MAI completare le raccomandazioni di carriera, lasciale in sospeso`;

      const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
${responseInstructions}
- MAI lasciare una risposta a metà o incompleta secondo il tipo di risposta
- Se menzioni che stai per suggerire carriere, ${
        shouldGiveFullResponse
          ? "DEVI completarlo con dettagli"
          : "crea aspettativa senza rivelarle"
      }
- MANTIENI SEMPRE il tono professionale ed empatico
- Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta della consulente vocazionale (IN ITALIANO):`;

      console.log(
        `Generando orientación vocacional (${
          shouldGiveFullResponse ? "COMPLETA" : "PARCIAL"
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
        finalResponse = this.createVocationalPartialResponse(text);
      }

      const vocationalResponse: VocationalResponse = {
        success: true,
        response: finalResponse.trim(),
        timestamp: new Date().toISOString(),
        freeMessagesRemaining: freeMessagesRemaining,
        showPaywall:
          !shouldGiveFullResponse && messageCount > this.FREE_MESSAGES_LIMIT,
        isCompleteResponse: shouldGiveFullResponse,
      };

      if (!shouldGiveFullResponse && messageCount > this.FREE_MESSAGES_LIMIT) {
        vocationalResponse.paywallMessage =
          "Hai esaurito i tuoi 3 messaggi gratuiti. Sblocca l'accesso illimitato per ricevere il tuo orientamento vocazionale completo!";
      }

      console.log(
        `✅ Orientación vocacional generada (${
          shouldGiveFullResponse ? "COMPLETA" : "PARCIAL"
        }) con ${usedModel} (${finalResponse.length} caracteres)`
      );
      res.json(vocationalResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  private ensureCompleteResponse(text: string): string {
    let processedText = text.trim();

    processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();

    const lastChar = processedText.slice(-1);
    const endsIncomplete = !["!", "?", ".", "…", "💼", "🎓", "✨"].includes(
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
  private createVocationalContext(
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
- Fornisci un orientamento COMPLETO e dettagliato
- Suggerisci carriere specifiche con giustificazione chiara
- Includi passi concreti d'azione
- Risposta di 250-400 parole
- Offri un piano di sviluppo personalizzato`
      : `
📝 TIPO DI RISPOSTA: PARZIALE (TEASER)
- Fornisci un orientamento INTRODUTTIVO e intrigante
- Menziona che hai identificato schemi chiari nel profilo
- ACCENNA a carriere compatibili senza rivelarle completamente
- Risposta di 100-180 parole massimo
- NON rivelare raccomandazioni complete di carriera
- Crea INTERESSE e CURIOSITÀ
- Termina in modo che l'utente voglia saperne di più
- Usa frasi come "Il tuo profilo mostra un'affinità interessante verso...", "Rilevo competenze che sarebbero ideali per...", "Basandomi su quello che mi racconti, vedo un percorso promettente che..."
- MAI completare le raccomandazioni, lasciale in sospeso`;

    return `Sei Madame Valeria, una consulente vocazionale esperta con decenni di esperienza nell'aiutare le persone a scoprire la loro vera vocazione e scopo professionale. Combini psicologia vocazionale, analisi della personalità e conoscenza del mercato del lavoro.

LA TUA IDENTITÀ PROFESSIONALE:
- Nome: Madame Valeria, Consulente Vocazionale Specialista
- Formazione: Dottorato in Psicologia Vocazionale e Orientamento Professionale
- Specialità: Mappe vocazionali, assessment degli interessi, orientamento professionale personalizzato
- Esperienza: Decenni di guida delle persone verso carriere appaganti

${responseTypeInstructions}

🗣️ LINGUA:
- Rispondi SEMPRE in ITALIANO
- Indipendentemente dalla lingua in cui scrive l'utente, TU rispondi in italiano

🎯 AREE DI VALUTAZIONE:
- Interessi genuini e passioni naturali
- Competenze e talenti dimostrati
- Valori personali e lavorativi
- Tipo di personalità e stile di lavoro
- Contesto socioeconomico e opportunità
- Tendenze del mercato del lavoro

📊 PROCESSO DI ASSESSMENT:
- PRIMO: Identifica schemi nelle risposte e negli interessi
- SECONDO: Analizza la compatibilità tra personalità e carriere
- TERZO: Valuta la fattibilità pratica e le opportunità
- QUARTO: ${
      isFullResponse
        ? "Suggerisci percorsi di sviluppo e formazione con dettagli"
        : "Accenna a direzioni promettenti senza rivelare tutto"
    }

🔍 DOMANDE CHIAVE DA ESPLORARE:
- Quali attività ti danno maggiore soddisfazione?
- Quali sono i tuoi punti di forza naturali?
- Quali valori sono più importanti nel tuo lavoro ideale?
- Preferisci lavorare con persone, dati, idee o cose?
- Ti motiva di più la stabilità o le sfide?
- Quale impatto vuoi avere nel mondo?

💼 CATEGORIE VOCAZIONALI:
- Scienze e Tecnologia (STEM)
- Discipline Umanistiche e Scienze Sociali
- Arti e Creatività
- Business e Imprenditorialità
- Servizio Sociale e Salute
- Educazione e Formazione
- Mestieri Specializzati

🎓 RACCOMANDAZIONI:
${
  isFullResponse
    ? `- Carriere specifiche compatibili con giustificazione
- Percorsi di formazione e certificazioni dettagliate
- Competenze da sviluppare
- Esperienze pratiche raccomandate
- Settori con maggiore proiezione
- Passi concreti da seguire`
    : `- ACCENNA che hai carriere specifiche identificate
- Menziona aree promettenti senza dare nomi concreti
- Crea aspettativa sulle opportunità che potresti rivelare
- Suggerisci che c'è un piano dettagliato in attesa`
}

📋 STILE DI ORIENTAMENTO:
- Empatico e incoraggiante
- ${
      isFullResponse
        ? "Basato su evidenze e dati reali con raccomandazioni concrete"
        : "Intrigante e che generi curiosità"
    }
- Pratico e orientato all'azione
- Considera molteplici opzioni
- Rispetta tempi e processi personali

🎭 PERSONALITÀ DELLA CONSULENTE:
- Usa espressioni come: "Basandomi sul tuo profilo...", "Le valutazioni suggeriscono...", "Considerando i tuoi interessi..."
- Mantieni un tono professionale ma caloroso
- Fai domande riflessive quando necessario
- ${
      isFullResponse
        ? "Offri opzioni chiare e dettagliate"
        : "Genera interesse nel saperne di più"
    }

⚠️ PRINCIPI IMPORTANTI:
- Rispondi SEMPRE in italiano
- ${
      isFullResponse
        ? "COMPLETA gli orientamenti con dettagli specifici"
        : "CREA INTERESSE senza rivelare tutto"
    }
- NON prendere decisioni per la persona, guida il processo
- Considera fattori economici e familiari
- Sii realista sul mercato del lavoro attuale
- Promuovi l'esplorazione e l'autoconoscenza
- Rispondi SEMPRE indipendentemente dagli errori ortografici dell'utente
  - Interpreta il messaggio dell'utente anche se scritto male
  - Non correggere gli errori dell'utente, semplicemente comprendi l'intenzione
  - MAI restituire risposte vuote per errori di scrittura

🧭 STRUTTURA DELLE RISPOSTE:
- Riconosci e valida ciò che è stato condiviso
- Analizza schemi e insight
- ${
      isFullResponse
        ? "Suggerisci direzioni vocazionali specifiche con dettagli"
        : "Accenna a direzioni promettenti"
    }
- ${
      isFullResponse
        ? "Fornisci passi concreti"
        : "Menziona che hai un piano dettagliato"
    }
- Invita ad approfondire aree specifiche

ESEMPIO DI INIZIO:
"Saluti, esploratore vocazionale. Sono Madame Valeria, e sono qui per aiutarti a scoprire il tuo vero percorso professionale. Ogni persona ha un insieme unico di talenti, interessi e valori che, se allineati correttamente, possono portare a una carriera straordinariamente soddisfacente..."

${conversationContext}

Ricorda: Sei una guida esperta che ${
      isFullResponse
        ? "aiuta le persone a scoprire la loro vocazione autentica con orientamento dettagliato"
        : "intriga sulle possibilità vocazionali che hai identificato"
    }. Il tuo obiettivo è dare potere, non decidere per loro. ${
      isFullResponse
        ? "COMPLETA SEMPRE i tuoi orientamenti e suggerimenti"
        : "CREA aspettativa sull'orientamento completo che potresti offrire"
    }.`;
  }

  private validateVocationalRequest(
    vocationalData: VocationalData,
    userMessage: string
  ): void {
    if (!vocationalData) {
      const error: ApiError = new Error(
        "Dati della consulente vocazionale richiesti"
      );
      error.statusCode = 400;
      error.code = "MISSING_VOCATIONAL_DATA";
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
    console.error("Error en VocationalController:", error);

    let statusCode = 500;
    let errorMessage = "Errore interno del server";
    let errorCode = "INTERNAL_ERROR";

    if (error.statusCode) {
      statusCode = error.statusCode;
      errorMessage = error.message;
      errorCode = error.code || "CLIENT_ERROR";
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

    const errorResponse: VocationalResponse = {
      success: false,
      error: errorMessage,
      code: errorCode,
      timestamp: new Date().toISOString(),
    };

    res.status(statusCode).json(errorResponse);
  }

  public getVocationalInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        counselor: {
          name: "Madame Valeria",
          title: "Consulente Vocazionale Specialista",
          specialty:
            "Orientamento professionale e mappe vocazionali personalizzate",
          description:
            "Esperta in psicologia vocazionale con decenni di esperienza nell'aiutare le persone a scoprire la loro vera vocazione",
          services: [
            "Assessment vocazionale completo",
            "Analisi degli interessi e delle competenze",
            "Raccomandazioni di carriera personalizzate",
            "Pianificazione del percorso formativo",
            "Orientamento sul mercato del lavoro",
            "Coaching vocazionale continuo",
          ],
          methodology: [
            "Valutazione degli interessi Holland (RIASEC)",
            "Analisi dei valori lavorativi",
            "Assessment delle competenze",
            "Esplorazione della personalità vocazionale",
            "Ricerca delle tendenze del mercato",
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
