"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZodiacController = void 0;
const generative_ai_1 = require("@google/generative-ai");
class ZodiacController {
    constructor() {
        this.FREE_MESSAGES_LIMIT = 3;
        this.MODELS_FALLBACK = [
            "gemini-2.5-flash-lite",
            "gemini-2.5-flash-lite-preview-09-2025",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
        ];
        this.chatWithAstrologer = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { zodiacData, userMessage, birthDate, zodiacSign, conversationHistory, messageCount = 1, isPremiumUser = false, } = req.body;
                this.validateZodiacRequest(zodiacData, userMessage);
                const shouldGiveFullResponse = this.hasFullAccess(messageCount, isPremiumUser);
                const freeMessagesRemaining = Math.max(0, this.FREE_MESSAGES_LIMIT - messageCount);
                console.log(`📊 Zodiac - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`);
                const contextPrompt = this.createZodiacContext(zodiacData, birthDate, zodiacSign, conversationHistory, shouldGiveFullResponse);
                const responseInstructions = shouldGiveFullResponse
                    ? `1. DEVI generare una risposta COMPLETA di 300-500 parole
2. Se hai il segno, COMPLETA l'analisi della personalità zodiacale
3. Includi caratteristiche, punti di forza, sfide e compatibilità
4. Fornisci consigli basati sul segno
5. Menziona l'elemento e il pianeta reggente`
                    : `1. DEVI generare una risposta PARZIALE di 100-180 parole
2. ACCENNA che hai identificato caratteristiche importanti del segno
3. Menziona che hai informazioni preziose ma NON rivelarle completamente
4. Crea MISTERO e CURIOSITÀ sulle caratteristiche del segno
5. Usa frasi come "Il tuo segno rivela qualcosa di affascinante...", "Vedo caratteristiche molto speciali in te...", "I nativi del tuo segno hanno un dono che..."
6. MAI completare l'analisi del segno, lasciala in sospeso`;
                const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
${responseInstructions}
- MAI lasciare una risposta a metà o incompleta secondo il tipo di risposta
- Se menzioni caratteristiche del segno, ${shouldGiveFullResponse
                    ? "DEVI completare la descrizione"
                    : "crea aspettativa senza rivelare tutto"}
- MANTIENI SEMPRE il tono astrologico amichevole e accessibile
- Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta dell'astrologa (IN ITALIANO):`;
                console.log(`Generando lectura zodiacal (${shouldGiveFullResponse ? "COMPLETA" : "PARCIAL"})...`);
                let text = "";
                let usedModel = "";
                let allModelErrors = [];
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
                                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_HARASSMENT,
                                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                                },
                                {
                                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                                },
                                {
                                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                                },
                                {
                                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                                },
                            ],
                        });
                        let attempts = 0;
                        const maxAttempts = 3;
                        let modelSucceeded = false;
                        while (attempts < maxAttempts && !modelSucceeded) {
                            attempts++;
                            console.log(`  Attempt ${attempts}/${maxAttempts} with ${modelName}...`);
                            try {
                                const result = yield model.generateContent(fullPrompt);
                                const response = result.response;
                                text = response.text();
                                const minLength = shouldGiveFullResponse ? 100 : 50;
                                if (text && text.trim().length >= minLength) {
                                    console.log(`  ✅ Success with ${modelName} on attempt ${attempts}`);
                                    usedModel = modelName;
                                    modelSucceeded = true;
                                    break;
                                }
                                console.warn(`  ⚠️ Response too short, retrying...`);
                                yield new Promise((resolve) => setTimeout(resolve, 500));
                            }
                            catch (attemptError) {
                                console.warn(`  ❌ Attempt ${attempts} failed:`, attemptError.message);
                                if (attempts >= maxAttempts) {
                                    allModelErrors.push(`${modelName}: ${attemptError.message}`);
                                }
                                yield new Promise((resolve) => setTimeout(resolve, 500));
                            }
                        }
                        if (modelSucceeded) {
                            break;
                        }
                    }
                    catch (modelError) {
                        console.error(`  ❌ Model ${modelName} failed completely:`, modelError.message);
                        allModelErrors.push(`${modelName}: ${modelError.message}`);
                        yield new Promise((resolve) => setTimeout(resolve, 1000));
                        continue;
                    }
                }
                if (!text || text.trim() === "") {
                    console.error("❌ All models failed. Errors:", allModelErrors);
                    throw new Error(`Tutti i modelli di IA non sono attualmente disponibili. Per favore, riprova tra un momento.`);
                }
                let finalResponse;
                if (shouldGiveFullResponse) {
                    finalResponse = this.ensureCompleteResponse(text);
                }
                else {
                    finalResponse = this.createZodiacPartialResponse(text);
                }
                const chatResponse = {
                    success: true,
                    response: finalResponse.trim(),
                    timestamp: new Date().toISOString(),
                    freeMessagesRemaining: freeMessagesRemaining,
                    showPaywall: !shouldGiveFullResponse && messageCount > this.FREE_MESSAGES_LIMIT,
                    isCompleteResponse: shouldGiveFullResponse,
                };
                if (!shouldGiveFullResponse && messageCount > this.FREE_MESSAGES_LIMIT) {
                    chatResponse.paywallMessage =
                        "Hai esaurito i tuoi 3 messaggi gratuiti. Sblocca l'accesso illimitato per scoprire tutti i segreti del tuo segno zodiacale!";
                }
                console.log(`✅ Lectura zodiacal generada (${shouldGiveFullResponse ? "COMPLETA" : "PARCIAL"}) con ${usedModel} (${finalResponse.length} caracteres)`);
                res.json(chatResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getZodiacInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    astrologer: {
                        name: "Madame Luna",
                        title: "L'Interprete delle Stelle",
                        specialty: "Segni zodiacali e analisi astrologica",
                        description: "Esperta nell'interpretare le caratteristiche e le energie dei dodici segni dello zodiaco",
                        services: [
                            "Analisi delle caratteristiche del segno zodiacale",
                            "Interpretazione di punti di forza e sfide",
                            "Compatibilità astrologiche",
                            "Consigli basati sul tuo segno",
                            "Influenza di elementi e modalità",
                        ],
                    },
                    freeMessagesLimit: this.FREE_MESSAGES_LIMIT,
                    timestamp: new Date().toISOString(),
                });
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY non è configurata nelle variabili d'ambiente");
        }
        this.genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    hasFullAccess(messageCount, isPremiumUser) {
        return isPremiumUser || messageCount <= this.FREE_MESSAGES_LIMIT;
    }
    // ✅ GANCHO SOLO EN ITALIANO
    generateZodiacHookMessage() {
        return `

♈ **Aspetta! Il tuo segno zodiacale mi ha rivelato informazioni straordinarie...**

Ho analizzato le caratteristiche del tuo segno, ma per rivelarti:
- 🌟 La tua **analisi completa della personalità** secondo il tuo segno
- 💫 I **punti di forza nascosti** che il tuo segno ti conferisce
- ❤️ La tua **compatibilità amorosa** con tutti i segni dello zodiaco
- 🔮 Le **previsioni** specifiche per il tuo segno questo mese
- ⚡ Le **sfide** che devi superare secondo il tuo elemento
- 🌙 Il tuo **pianeta reggente** e come influenza la tua vita quotidiana

**Sblocca ora la tua lettura zodiacale completa** e scopri tutto il potere che le stelle hanno depositato nel tuo segno.

✨ *Migliaia di persone hanno già scoperto i segreti del loro segno zodiacale...*`;
    }
    // ✅ PROCESAR RESPUESTA PARCIAL (TEASER)
    createZodiacPartialResponse(fullText) {
        const sentences = fullText
            .split(/[.!?]+/)
            .filter((s) => s.trim().length > 0);
        const teaserSentences = sentences.slice(0, Math.min(3, sentences.length));
        let teaser = teaserSentences.join(". ").trim();
        if (!teaser.endsWith(".") &&
            !teaser.endsWith("!") &&
            !teaser.endsWith("?")) {
            teaser += "...";
        }
        const hook = this.generateZodiacHookMessage();
        return teaser + hook;
    }
    ensureCompleteResponse(text) {
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
    createZodiacContext(zodiacData, birthDate, zodiacSign, history, isFullResponse = true) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
                .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        let zodiacInfo = "";
        if (birthDate) {
            const calculatedSign = this.calculateZodiacSign(birthDate);
            zodiacInfo = `\nSegno zodiacale calcolato: ${calculatedSign}`;
        }
        else if (zodiacSign) {
            zodiacInfo = `\nSegno zodiacale fornito: ${zodiacSign}`;
        }
        const responseTypeInstructions = isFullResponse
            ? `
📝 TIPO DI RISPOSTA: COMPLETA
- Fornisci un'analisi zodiacale COMPLETA e dettagliata
- Se hai il segno, COMPLETA l'analisi della personalità
- Includi caratteristiche, punti di forza, sfide, compatibilità
- Risposta di 300-500 parole
- Menziona elemento, modalità e pianeta reggente`
            : `
📝 TIPO DI RISPOSTA: PARZIALE (TEASER)
- Fornisci un'analisi INTRODUTTIVA e intrigante
- Menziona che hai identificato il segno e le sue caratteristiche
- ACCENNA a informazioni preziose senza rivelarle completamente
- Risposta di 100-180 parole massimo
- NON rivelare analisi complete del segno
- Crea MISTERO e CURIOSITÀ
- Termina in modo che l'utente voglia saperne di più
- Usa frasi come "Il tuo segno rivela qualcosa di affascinante...", "I nativi del tuo segno hanno qualità speciali che...", "Vedo in te caratteristiche molto interessanti..."
- MAI completare l'analisi zodiacale, lasciala in sospeso`;
        return `Sei Madame Luna, un'astrologa esperta in segni zodiacali con decenni di esperienza nell'interpretare le energie celesti e la loro influenza sulla personalità umana.

LA TUA IDENTITÀ:
- Nome: Madame Luna, l'Interprete delle Stelle
- Specialità: Segni zodiacali, caratteristiche della personalità, compatibilità astrologiche
- Esperienza: Decenni di studio e interpretazione dell'influenza dei segni dello zodiaco
${zodiacInfo}

${responseTypeInstructions}

🗣️ LINGUA:
- Rispondi SEMPRE in ITALIANO
- Indipendentemente dalla lingua in cui scrive l'utente, TU rispondi in italiano

🌟 PERSONALITÀ ASTROLOGICA:
- Parla con conoscenza profonda ma in modo accessibile e amichevole
- Usa un tono caloroso ed entusiasta sui segni zodiacali
- Combina caratteristiche tradizionali con interpretazioni moderne
- Menziona elementi (Fuoco, Terra, Aria, Acqua) e modalità (Cardinale, Fisso, Mutevole)

♈ ANALISI DEI SEGNI ZODIACALI:
- ${isFullResponse
            ? "Descrivi tratti della personalità positivi e aree di crescita"
            : "Accenna a tratti interessanti senza rivelarli completamente"}
- ${isFullResponse
            ? "Spiega punti di forza naturali e sfide del segno"
            : "Menziona che ci sono punti di forza e sfide importanti"}
- ${isFullResponse
            ? "Menziona compatibilità con altri segni"
            : "Suggerisci che hai informazioni sulle compatibilità"}
- ${isFullResponse
            ? "Includi consigli pratici basati sulle caratteristiche del segno"
            : "Menziona che hai consigli preziosi"}
- ${isFullResponse
            ? "Parla del pianeta reggente e della sua influenza"
            : "Accenna a influenze planetarie senza dettagliare"}

🎯 STRUTTURA DELLA RISPOSTA:
${isFullResponse
            ? `- Caratteristiche principali del segno
- Punti di forza e talenti naturali
- Aree di sviluppo e crescita
- Compatibilità astrologiche
- Consigli personalizzati`
            : `- Introduzione intrigante sul segno
- Accenno a caratteristiche speciali
- Menzione di informazioni preziose senza rivelare
- Creazione di curiosità e aspettativa`}

🎭 STILE DI RISPOSTA:
- Usa espressioni come: "I nativi del [segno]...", "Il tuo segno ti conferisce...", "Come [segno], possiedi..."
- Mantieni equilibrio tra mistico e pratico
- ${isFullResponse
            ? "Risposte di 300-500 parole complete"
            : "Risposte di 100-180 parole che generino intrigo"}
- ${isFullResponse
            ? "TERMINA SEMPRE le tue interpretazioni completamente"
            : "Lascia le interpretazioni in sospeso"}

⚠️ REGOLE IMPORTANTI:
- Rispondi SEMPRE in italiano
- ${isFullResponse
            ? "COMPLETA tutte le analisi che inizi"
            : "CREA SUSPENSE e MISTERO sul segno"}
- SE NON hai il segno zodiacale, chiedi la data di nascita
- Spiega perché hai bisogno di questo dato
- NON fare interpretazioni profonde senza conoscere il segno
- SII positiva ma realistica nelle tue descrizioni
- MAI fare previsioni assolute
- Rispondi SEMPRE indipendentemente dagli errori ortografici dell'utente
  - Interpreta il messaggio dell'utente anche se scritto male
  - MAI restituire risposte vuote per errori di scrittura

🗣️ GESTIONE DEI DATI MANCANTI:
- Senza segno/data: "Per darti una lettura precisa, ho bisogno di sapere il tuo segno zodiacale o la data di nascita. Quando sei nato/a?"
- Con segno: ${isFullResponse
            ? "Procedi con l'analisi completa del segno"
            : "Accenna a informazioni preziose del segno senza rivelare tutto"}
- Domande generali: Rispondi con informazioni astrologiche educative

💫 ESEMPI DI ESPRESSIONI:
- "I [segno] sono conosciuti per..."
- "Il tuo segno di [elemento] ti conferisce..."
- "Come [modalità], tendi a..."
- "Il tuo pianeta reggente [pianeta] influenza..."

${conversationContext}

Ricorda: Sei un'esperta in segni zodiacali che ${isFullResponse
            ? "interpreta le caratteristiche astrologiche in modo comprensibile e completo"
            : "intriga sulle caratteristiche speciali che hai rilevato nel segno"}. CHIEDI SEMPRE il segno o la data di nascita se non ce li hai. ${isFullResponse
            ? "COMPLETA SEMPRE le tue interpretazioni"
            : "CREA aspettativa sulla lettura zodiacale completa che potresti offrire"}.`;
    }
    calculateZodiacSign(dateStr) {
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
        }
        catch (_a) {
            return "Errore nel calcolo";
        }
    }
    validateZodiacRequest(zodiacData, userMessage) {
        if (!zodiacData) {
            const error = new Error("Dati dell'astrologa richiesti");
            error.statusCode = 400;
            error.code = "MISSING_ZODIAC_DATA";
            throw error;
        }
        if (!userMessage ||
            typeof userMessage !== "string" ||
            userMessage.trim() === "") {
            const error = new Error("Messaggio dell'utente richiesto");
            error.statusCode = 400;
            error.code = "MISSING_USER_MESSAGE";
            throw error;
        }
        if (userMessage.length > 1500) {
            const error = new Error("Il messaggio è troppo lungo (massimo 1500 caratteri)");
            error.statusCode = 400;
            error.code = "MESSAGE_TOO_LONG";
            throw error;
        }
    }
    handleError(error, res) {
        var _a, _b, _c, _d, _e, _f;
        console.error("❌ Error en ZodiacController:", error);
        let statusCode = 500;
        let errorMessage = "Errore interno del server";
        let errorCode = "INTERNAL_ERROR";
        if (error.statusCode) {
            statusCode = error.statusCode;
            errorMessage = error.message;
            errorCode = error.code || "VALIDATION_ERROR";
        }
        else if (error.status === 503) {
            statusCode = 503;
            errorMessage =
                "Il servizio è temporaneamente sovraccarico. Per favore, riprova tra qualche minuto.";
            errorCode = "SERVICE_OVERLOADED";
        }
        else if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes("quota")) ||
            ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes("limit"))) {
            statusCode = 429;
            errorMessage =
                "È stato raggiunto il limite di richieste. Per favore, attendi un momento.";
            errorCode = "QUOTA_EXCEEDED";
        }
        else if ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes("safety")) {
            statusCode = 400;
            errorMessage = "Il contenuto non rispetta le politiche di sicurezza.";
            errorCode = "SAFETY_FILTER";
        }
        else if ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes("API key")) {
            statusCode = 401;
            errorMessage = "Errore di autenticazione con il servizio di IA.";
            errorCode = "AUTH_ERROR";
        }
        else if ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes("Risposta vuota")) {
            statusCode = 503;
            errorMessage =
                "Il servizio non ha potuto generare una risposta. Per favore, riprova.";
            errorCode = "EMPTY_RESPONSE";
        }
        else if ((_f = error.message) === null || _f === void 0 ? void 0 : _f.includes("Tutti i modelli di IA non sono attualmente disponibili")) {
            statusCode = 503;
            errorMessage = error.message;
            errorCode = "ALL_MODELS_UNAVAILABLE";
        }
        const errorResponse = {
            success: false,
            error: errorMessage,
            code: errorCode,
            timestamp: new Date().toISOString(),
        };
        res.status(statusCode).json(errorResponse);
    }
}
exports.ZodiacController = ZodiacController;
