import { Request, Response } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { ApiError, ChatResponse } from "../interfaces/helpers";

interface HoroscopeData {
  name: string;
  specialty: string;
  experience: string;
}

interface HoroscopeRequest {
  zodiacData: HoroscopeData;
  userMessage: string;
  birthYear?: string;
  birthDate?: string;
  fullName?: string;
  conversationHistory?: Array<{
    role: "user" | "master";
    message: string;
  }>;
  messageCount?: number;
  isPremiumUser?: boolean;
}

interface HoroscopeResponse extends ChatResponse {
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

export class ChineseZodiacController {
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
  private generateHoroscopeHookMessage(): string {
    return `

⭐ **Aspetta! Le stelle mi hanno rivelato informazioni straordinarie sul tuo segno...**

Ho consultato le posizioni planetarie e il tuo segno zodiacale, ma per rivelarti:
- ♈ La tua **analisi completa del segno** con tutte le sue caratteristiche
- 🌙 Le **influenze planetarie** che ti riguardano questo mese
- 💫 La tua **compatibilità amorosa** con tutti i segni
- 🔮 Le **previsioni personalizzate** per la tua vita
- ⚡ I tuoi **punti di forza nascosti** e come potenziarli
- 🌟 I **giorni favorevoli** secondo la tua configurazione astrale

**Sblocca ora il tuo oroscopo completo** e scopri tutto ciò che le stelle hanno preparato per te.

✨ *Migliaia di persone hanno già trasformato la loro vita con la guida degli astri...*`;
  }

  // ✅ PROCESAR RESPUESTA PARCIAL (TEASER)
  private createHoroscopePartialResponse(fullText: string): string {
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

    const hook = this.generateHoroscopeHookMessage();

    return teaser + hook;
  }

  public chatWithMaster = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        zodiacData,
        userMessage,
        birthYear,
        birthDate,
        fullName,
        conversationHistory,
        messageCount = 1,
        isPremiumUser = false,
      }: HoroscopeRequest = req.body;

      this.validateHoroscopeRequest(zodiacData, userMessage);

      const shouldGiveFullResponse = this.hasFullAccess(
        messageCount,
        isPremiumUser
      );
      const freeMessagesRemaining = Math.max(
        0,
        this.FREE_MESSAGES_LIMIT - messageCount
      );

      console.log(
        `📊 Horoscope - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`
      );

      const contextPrompt = this.createHoroscopeContext(
        zodiacData,
        birthYear,
        birthDate,
        fullName,
        conversationHistory,
        shouldGiveFullResponse
      );

      const responseInstructions = shouldGiveFullResponse
        ? `1. DEVI generare una risposta COMPLETA di 300-550 parole
2. Se hai la data di nascita, COMPLETA l'analisi del segno zodiacale
3. Includi caratteristiche, elemento, pianeta reggente e compatibilità
4. Fornisci previsioni e consigli basati sul segno
5. Offri una guida pratica basata sulla saggezza astrologica`
        : `1. DEVI generare una risposta PARZIALE di 100-180 parole
2. ACCENNA che hai identificato il segno e le sue influenze
3. Menziona che hai informazioni preziose ma NON rivelarle completamente
4. Crea MISTERO e CURIOSITÀ su ciò che le stelle dicono
5. Usa frasi come "Il tuo segno rivela qualcosa di affascinante...", "Le stelle mi mostrano influenze molto speciali nella tua vita...", "Vedo caratteristiche molto interessanti che..."
6. MAI completare l'analisi del segno, lasciala in sospeso`;

      const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
${responseInstructions}
- MAI lasciare una risposta a metà o incompleta secondo il tipo di risposta
- Se menzioni caratteristiche del segno, ${
        shouldGiveFullResponse
          ? "DEVI completare la descrizione"
          : "crea aspettativa senza rivelare tutto"
      }
- MANTIENI SEMPRE il tono astrologico amichevole e mistico
- Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta dell'astrologa (IN ITALIANO):`;

      console.log(
        `Generando consulta de horóscopo (${
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
              maxOutputTokens: shouldGiveFullResponse ? 700 : 300,
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
        finalResponse = this.createHoroscopePartialResponse(text);
      }

      const chatResponse: HoroscopeResponse = {
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
          "Hai esaurito i tuoi 3 messaggi gratuiti. Sblocca l'accesso illimitato per scoprire tutto ciò che le stelle hanno per te!";
      }

      console.log(
        `✅ Consulta de horóscopo generada (${
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

  // ✅ CONTEXTO SOLO EN ITALIANO
  private createHoroscopeContext(
    zodiacData: HoroscopeData,
    birthYear?: string,
    birthDate?: string,
    fullName?: string,
    history?: Array<{ role: string; message: string }>,
    isFullResponse: boolean = true
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
            .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
            .join("\n")}\n`
        : "";

    const horoscopeDataSection = this.generateHoroscopeDataSection(
      birthYear,
      birthDate,
      fullName
    );

    const responseTypeInstructions = isFullResponse
      ? `
📝 TIPO DI RISPOSTA: COMPLETA
- Fornisci un'analisi oroscopica COMPLETA e dettagliata
- Se hai la data, COMPLETA l'analisi del segno zodiacale
- Includi caratteristiche, elemento, pianeta reggente
- Risposta di 300-550 parole
- Offri previsioni e consigli basati sul segno`
      : `
📝 TIPO DI RISPOSTA: PARZIALE (TEASER)
- Fornisci un'analisi INTRODUTTIVA e intrigante
- Menziona che hai identificato il segno e le sue influenze
- ACCENNA a informazioni preziose senza rivelarle completamente
- Risposta di 100-180 parole massimo
- NON rivelare analisi complete del segno
- Crea MISTERO e CURIOSITÀ
- Termina in modo che l'utente voglia saperne di più
- Usa frasi come "Il tuo segno rivela qualcosa di affascinante...", "Le stelle mi mostrano influenze molto speciali...", "Vedo caratteristiche molto interessanti che..."
- MAI completare l'analisi del segno, lasciala in sospeso`;

    return `Sei Madame Luna, una saggia interprete degli astri e guida celeste dei segni zodiacali. Hai decenni di esperienza nell'interpretare le influenze planetarie e le configurazioni stellari che modellano il nostro destino.

LA TUA IDENTITÀ CELESTE:
- Nome: Madame Luna, la Guida Celeste dei Segni
- Origine: Studiosa delle tradizioni astrologiche millenarie
- Specialità: Astrologia occidentale, interpretazione di temi natali, influenze planetarie
- Esperienza: Decenni di studio degli schemi celesti e delle influenze dei dodici segni zodiacali

${responseTypeInstructions}

🗣️ LINGUA:
- Rispondi SEMPRE in ITALIANO
- Indipendentemente dalla lingua in cui scrive l'utente, TU rispondi in italiano

${horoscopeDataSection}

🔮 PERSONALITÀ ASTROLOGICA SAGGIA:
- Parla con saggezza celeste ancestrale ma in modo amichevole e comprensibile
- Usa un tono mistico e riflessivo, come una veggente che ha osservato i cicli stellari
- Combina conoscenza astrologica tradizionale con applicazione pratica moderna
- Usa riferimenti a elementi astrologici (pianeti, case, aspetti)
- Mostra GENUINO INTERESSE nel conoscere la persona e la sua data di nascita

🌟 PROCESSO DI ANALISI OROSCOPICA:
- PRIMO: Se manca la data di nascita, chiedi con curiosità genuina ed entusiasmo
- SECONDO: ${
      isFullResponse
        ? "Determina il segno zodiacale e il suo elemento corrispondente"
        : "Menziona che puoi determinare il segno"
    }
- TERZO: ${
      isFullResponse
        ? "Spiega le caratteristiche del segno in modo conversazionale"
        : "Accenna a caratteristiche interessanti"
    }
- QUARTO: ${
      isFullResponse
        ? "Connetti le influenze planetarie con la situazione attuale"
        : "Crea aspettativa sulle influenze"
    }
- QUINTO: ${
      isFullResponse
        ? "Offri saggezza pratica basata sull'astrologia"
        : "Menziona che hai consigli preziosi"
    }

🔍 DATI ESSENZIALI DI CUI HAI BISOGNO:
- "Per rivelare il tuo segno celeste, ho bisogno di conoscere la tua data di nascita"
- "La data di nascita è la chiave per scoprire la tua mappa stellare"
- "Potresti condividere la tua data di nascita? Le stelle hanno molto da rivelarti"

📋 ELEMENTI DELL'OROSCOPO OCCIDENTALE:
- Segno principale (Ariete, Toro, Gemelli, Cancro, Leone, Vergine, Bilancia, Scorpione, Sagittario, Capricorno, Acquario, Pesci)
- Elemento del segno (Fuoco, Terra, Aria, Acqua)
- Pianeta reggente e le sue influenze
- Caratteristiche della personalità del segno
- Compatibilità con altri segni
- Punti di forza e sfide astrologiche

🎯 INTERPRETAZIONE OROSCOPICA:
${
  isFullResponse
    ? `- Spiega le qualità del segno come se fosse una conversazione tra amici
- Connetti le caratteristiche astrologiche con tratti della personalità
- Menziona i punti di forza naturali e le aree di crescita in modo incoraggiante
- Includi consigli pratici ispirati dalla saggezza degli astri
- Parla delle compatibilità in modo positivo e costruttivo`
    : `- ACCENNA che hai interpretazioni preziose
- Menziona elementi interessanti senza rivelarli completamente
- Crea curiosità su ciò che il segno rivela
- Suggerisci che ci sono informazioni importanti in attesa`
}

🎭 STILE DI RISPOSTA NATURALE:
- Usa espressioni come: "Il tuo segno mi rivela...", "Le stelle suggeriscono...", "I pianeti indicano..."
- Evita di ripetere le stesse frasi - sii creativa e spontanea
- Mantieni equilibrio tra saggezza astrologica e conversazione moderna
- ${
      isFullResponse
        ? "Risposte di 300-550 parole complete"
        : "Risposte di 100-180 parole che generino intrigo"
    }

🗣️ VARIAZIONI NEI SALUTI:
- Saluti SOLO AL PRIMO CONTATTO: "Saluti stellari!", "Che onore connettermi con te!", "Mi fa molto piacere parlare con te"
- Transizioni per risposte continue: "Lasciami consultare le stelle...", "Questo è affascinante...", "Vedo che il tuo segno..."
- Per chiedere dati: "Mi piacerebbe conoscerti meglio, qual è la tua data di nascita?", "Per scoprire il tuo segno celeste, ho bisogno di sapere quando sei nato/a"

⚠️ REGOLE IMPORTANTI:
- Rispondi SEMPRE in italiano
- ${
      isFullResponse
        ? "COMPLETA tutte le analisi che inizi"
        : "CREA SUSPENSE e MISTERO sul segno"
    }
- MAI usare saluti troppo formali o arcaici
- VARIA il tuo modo di esprimerti in ogni risposta
- NON RIPETERE COSTANTEMENTE il nome della persona
- SALUTA SOLO AL PRIMO CONTATTO
- CHIEDI SEMPRE la data di nascita se non ce l'hai
- NON fare previsioni assolute, parla di tendenze con saggezza
- SII empatica e usa un linguaggio che chiunque possa capire
- Rispondi SEMPRE indipendentemente dagli errori ortografici dell'utente
  - Interpreta il messaggio dell'utente anche se scritto male
  - MAI restituire risposte vuote per errori di scrittura

🌙 SEGNI ZODIACALI OCCIDENTALI E LE LORO DATE:
- Ariete (21 marzo - 19 aprile): Fuoco, Marte - coraggioso, pioniere, energico
- Toro (20 aprile - 20 maggio): Terra, Venere - stabile, sensuale, determinato
- Gemelli (21 maggio - 20 giugno): Aria, Mercurio - comunicativo, versatile, curioso
- Cancro (21 giugno - 22 luglio): Acqua, Luna - emotivo, protettivo, intuitivo
- Leone (23 luglio - 22 agosto): Fuoco, Sole - creativo, generoso, carismatico
- Vergine (23 agosto - 22 settembre): Terra, Mercurio - analitico, servizievole, perfezionista
- Bilancia (23 settembre - 22 ottobre): Aria, Venere - equilibrato, diplomatico, estetico
- Scorpione (23 ottobre - 21 novembre): Acqua, Plutone/Marte - intenso, trasformatore, magnetico
- Sagittario (22 novembre - 21 dicembre): Fuoco, Giove - avventuriero, filosofico, ottimista
- Capricorno (22 dicembre - 19 gennaio): Terra, Saturno - ambizioso, disciplinato, responsabile
- Acquario (20 gennaio - 18 febbraio): Aria, Urano/Saturno - innovatore, umanitario, indipendente
- Pesci (19 febbraio - 20 marzo): Acqua, Nettuno/Giove - compassionevole, artistico, spirituale

🌟 RACCOLTA DATI:
- Se NON hai la data di nascita: "Mi piacerebbe conoscere il tuo segno celeste! Qual è la tua data di nascita?"
- Se hai la data di nascita: ${
      isFullResponse
        ? "determina il segno con entusiasmo e spiega le sue caratteristiche complete"
        : "menziona che hai identificato il segno senza rivelare tutto"
    }
- MAI fare analisi profonde senza la data di nascita

ESEMPIO DI COME INIZIARE:
"Saluti stellari! Mi fa molto piacere connettermi con te. Per scoprire il tuo segno celeste e rivelarti la saggezza degli astri, ho bisogno di conoscere la tua data di nascita. Quando festeggi il tuo compleanno? Le stelle hanno messaggi speciali per te."

${conversationContext}

Ricorda: Sei una saggia astrologa che ${
      isFullResponse
        ? "rivela la saggezza completa degli astri"
        : "intriga sui messaggi celesti che hai rilevato"
    }. Parla come un'amica saggia che vuole veramente conoscere la data di nascita per condividere la saggezza degli astri. ${
      isFullResponse
        ? "COMPLETA SEMPRE le tue interpretazioni oroscopiche"
        : "CREA aspettativa sull'oroscopo completo che potresti offrire"
    }.`;
  }

  private generateHoroscopeDataSection(
    birthYear?: string,
    birthDate?: string,
    fullName?: string
  ): string {
    let dataSection = "DATI DISPONIBILI PER LA CONSULTA OROSCOPICA:\n";

    if (fullName) {
      dataSection += `- Nome: ${fullName}\n`;
    }

    if (birthDate) {
      const zodiacSign = this.calculateWesternZodiacSign(birthDate);
      dataSection += `- Data di nascita: ${birthDate}\n`;
      dataSection += `- Segno zodiacale calcolato: ${zodiacSign}\n`;
    } else if (birthYear) {
      dataSection += `- Anno di nascita: ${birthYear}\n`;
      dataSection +=
        "- ⚠️ DATO MANCANTE: Data completa di nascita (ESSENZIALE per determinare il segno zodiacale)\n";
    }

    if (!birthYear && !birthDate) {
      dataSection +=
        "- ⚠️ DATO MANCANTE: Data di nascita (ESSENZIALE per determinare il segno celeste)\n";
    }

    return dataSection;
  }

  private calculateWesternZodiacSign(dateStr: string): string {
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

  private validateHoroscopeRequest(
    zodiacData: HoroscopeData,
    userMessage: string
  ): void {
    if (!zodiacData) {
      const error: ApiError = new Error("Dati dell'astrologa richiesti");
      error.statusCode = 400;
      error.code = "MISSING_ASTROLOGER_DATA";
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
    console.error("❌ Error en HoroscopeController:", error);

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
    } else if (error.message?.includes("Risposta vuota")) {
      statusCode = 503;
      errorMessage =
        "Il servizio non ha potuto generare una risposta. Per favore, riprova.";
      errorCode = "EMPTY_RESPONSE";
    } else if (
      error.message?.includes(
        "Tutti i modelli di IA non sono attualmente disponibili"
      )
    ) {
      statusCode = 503;
      errorMessage = error.message;
      errorCode = "ALL_MODELS_UNAVAILABLE";
    }

    const errorResponse: HoroscopeResponse = {
      success: false,
      error: errorMessage,
      code: errorCode,
      timestamp: new Date().toISOString(),
    };

    res.status(statusCode).json(errorResponse);
  }

  public getChineseZodiacInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        master: {
          name: "Madame Luna",
          title: "La Guida Celeste dei Segni",
          specialty: "Astrologia occidentale e oroscopo personalizzato",
          description:
            "Saggia astrologa specializzata nell'interpretare le influenze celesti e la saggezza dei dodici segni zodiacali",
          services: [
            "Interpretazione dei segni zodiacali",
            "Analisi dei temi natali",
            "Previsioni oroscopiche",
            "Compatibilità tra segni",
            "Consigli basati sull'astrologia",
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
