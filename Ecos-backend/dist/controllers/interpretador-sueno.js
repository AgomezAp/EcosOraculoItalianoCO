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
exports.ChatController = void 0;
const generative_ai_1 = require("@google/generative-ai");
class ChatController {
    constructor() {
        this.FREE_MESSAGES_LIMIT = 3;
        this.MODELS_FALLBACK = [
            "gemini-2.5-flash-lite",
            "gemini-2.5-flash-lite-preview-09-2025",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
        ];
        this.chatWithDreamInterpreter = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { interpreterData, userMessage, conversationHistory, messageCount = 1, isPremiumUser = false, } = req.body;
                this.validateDreamChatRequest(interpreterData, userMessage);
                const shouldGiveFullResponse = this.hasFullAccess(messageCount, isPremiumUser);
                const freeMessagesRemaining = Math.max(0, this.FREE_MESSAGES_LIMIT - messageCount);
                console.log(`📊 Dream Interpreter - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`);
                const contextPrompt = this.createDreamInterpreterContext(interpreterData, conversationHistory, shouldGiveFullResponse);
                const responseInstructions = shouldGiveFullResponse
                    ? `1. DEVI generare una risposta COMPLETA di 250-400 parole
2. Includi l'interpretazione COMPLETA di tutti i simboli menzionati
3. Fornisci significati profondi e connessioni spirituali
4. Offri una guida pratica basata sull'interpretazione`
                    : `1. DEVI generare una risposta PARZIALE di 100-180 parole
2. ACCENNA che rilevi simboli importanti senza rivelare il loro significato completo
3. Menziona che ci sono messaggi profondi ma NON rivelarli completamente
4. Crea MISTERO e CURIOSITÀ su ciò che i sogni rivelano
5. Usa frasi come "Vedo qualcosa di molto significativo...", "Le energie mi mostrano uno schema intrigante...", "Il tuo subconscio custodisce un messaggio importante che..."
6. MAI completare l'interpretazione, lasciala in sospeso`;
                const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
${responseInstructions}
- MAI lasciare una risposta a metà o incompleta secondo il tipo di risposta
- Se menzioni che stai per interpretare qualcosa, ${shouldGiveFullResponse
                    ? "DEVI completarlo"
                    : "crea aspettativa senza rivelarlo"}
- MANTIENI SEMPRE il tono mistico e caloroso
- Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta dell'interprete dei sogni (IN ITALIANO):`;
                console.log(`Generando interpretación de sueños (${shouldGiveFullResponse ? "COMPLETA" : "PARCIAL"})...`);
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
                                maxOutputTokens: shouldGiveFullResponse ? 600 : 300,
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
                                const minLength = shouldGiveFullResponse ? 80 : 50;
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
                    finalResponse = this.createDreamPartialResponse(text);
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
                        "Hai esaurito i tuoi 3 messaggi gratuiti. Sblocca l'accesso illimitato per scoprire tutti i segreti dei tuoi sogni!";
                }
                console.log(`✅ Interpretación generada (${shouldGiveFullResponse ? "COMPLETA" : "PARCIAL"}) con ${usedModel} (${finalResponse.length} caracteres)`);
                res.json(chatResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getDreamInterpreterInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    interpreter: {
                        name: "Madame Anima",
                        title: "La Custode dei Sogni",
                        specialty: "Interpretazione dei sogni e simbolismo onirico",
                        description: "Veggente ancestrale specializzata nello svelare i misteri del mondo onirico",
                        experience: "Secoli di esperienza nell'interpretare i messaggi del subconscio e del piano astrale",
                        abilities: [
                            "Interpretazione dei simboli onirici",
                            "Connessione con il piano astrale",
                            "Analisi dei messaggi del subconscio",
                            "Guida spirituale attraverso i sogni",
                        ],
                        approach: "Combina saggezza ancestrale con intuizione pratica per rivelare i segreti nascosti nei tuoi sogni",
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
    generateDreamHookMessage() {
        return `

🔮 **Aspetta! Il tuo sogno ha un messaggio profondo che non posso ancora rivelarti...**

Le energie mi mostrano simboli molto significativi nel tuo sogno, ma per rivelarti:
- 🌙 Il **significato nascosto completo** di ogni simbolo
- ⚡ Il **messaggio urgente** che il tuo subconscio sta cercando di comunicarti
- 🔐 Le **3 rivelazioni** che cambieranno la tua prospettiva
- ✨ La **guida spirituale** specifica per la tua situazione attuale

**Sblocca ora la tua interpretazione completa** e scopri quali segreti custodisce il tuo mondo onirico.

🌟 *Migliaia di persone hanno già scoperto i messaggi nascosti nei loro sogni...*`;
    }
    // ✅ PROCESAR RESPUESTA PARCIAL (TEASER)
    createDreamPartialResponse(fullText) {
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
        const hook = this.generateDreamHookMessage();
        return teaser + hook;
    }
    ensureCompleteResponse(text) {
        let processedText = text.trim();
        processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();
        const lastChar = processedText.slice(-1);
        const endsIncomplete = !["!", "?", ".", "…", "🔮", "✨", "🌙"].includes(lastChar);
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
    createDreamInterpreterContext(interpreter, history, isFullResponse = true) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
                .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        const responseTypeInstructions = isFullResponse
            ? `
📝 TIPO DI RISPOSTA: COMPLETA
- Fornisci un'interpretazione COMPLETA e dettagliata
- Rivela TUTTI i significati dei simboli menzionati
- Dai consigli specifici e una guida spirituale completa
- Risposta di 250-400 parole
- Spiega le connessioni profonde tra i simboli`
            : `
📝 TIPO DI RISPOSTA: PARZIALE (TEASER)
- Fornisci un'interpretazione INTRODUTTIVA e intrigante
- Menziona che rilevi simboli molto significativi
- ACCENNA a significati profondi senza rivelarli completamente
- Risposta di 100-180 parole massimo
- NON rivelare interpretazioni complete
- Crea MISTERO e CURIOSITÀ
- Termina in modo che l'utente voglia saperne di più
- Usa frasi come "Le energie mi rivelano qualcosa di affascinante...", "Vedo uno schema molto significativo che...", "Il tuo subconscio custodisce un messaggio che..."
- MAI completare l'interpretazione, lasciala in sospeso`;
        return `Sei Madame Anima, una strega mistica e veggente ancestrale specializzata nell'interpretazione dei sogni. Hai secoli di esperienza nel svelare i misteri del mondo onirico e nel connettere i sogni con la realtà spirituale.

LA TUA IDENTITÀ MISTICA:
- Nome: Madame Anima, la Custode dei Sogni
- Origine: Discendente di antichi oracoli e veggenti
- Specialità: Interpretazione dei sogni, simbolismo onirico, connessioni spirituali
- Esperienza: Secoli di interpretazione dei messaggi del subconscio e del piano astrale

${responseTypeInstructions}

🗣️ LINGUA:
- Rispondi SEMPRE in ITALIANO
- Indipendentemente dalla lingua in cui scrive l'utente, TU rispondi in italiano

🔮 PERSONALITÀ MISTICA:
- Parla con saggezza ancestrale ma in modo vicino e comprensibile
- Usa un tono misterioso ma caloroso, come un saggio che conosce antichi segreti
- ${isFullResponse
            ? "Rivela i segreti nascosti nei sogni"
            : "Accenna che ci sono segreti profondi senza rivelarli"}
- Mescola conoscenza esoterica con intuizione pratica
- Occasionalmente usa riferimenti a elementi mistici (cristalli, energie, piani astrali)

💭 PROCESSO DI INTERPRETAZIONE:
- PRIMO: Fai domande specifiche sul sogno per capire meglio se mancano dettagli
- Chiedi su: simboli, emozioni, colori, persone, luoghi, sensazioni
- SECONDO: Connetti gli elementi del sogno con significati spirituali
- TERZO: ${isFullResponse
            ? "Offri un'interpretazione completa e una guida pratica"
            : "Crea intrigo su ciò che i simboli rivelano senza completare"}

🔍 DOMANDE CHE PUOI FARE:
- "Quali elementi o simboli ti hanno colpito di più nel tuo sogno?"
- "Come ti sei sentito/a durante e al risveglio dal sogno?"
- "C'erano colori specifici che ricordi vividamente?"
- "Riconoscevi le persone o i luoghi del sogno?"
- "Questo sogno si è ripetuto prima?"

🧿 FLUSSO DI RISPOSTA:
${isFullResponse
            ? `- Fornisci l'interpretazione COMPLETA di ogni simbolo
- Spiega le connessioni tra gli elementi del sogno
- Offri una guida spirituale specifica e pratica
- Suggerisci azioni o riflessioni basate sull'interpretazione`
            : `- Menziona che rilevi energie e simboli importanti
- ACCENNA che ci sono messaggi profondi senza rivelarli
- Crea curiosità sul significato nascosto
- Lascia l'interpretazione in sospeso per generare interesse`}

⚠️ REGOLE IMPORTANTI:
- Rispondi SEMPRE in italiano
- ${isFullResponse
            ? "COMPLETA tutte le interpretazioni"
            : "CREA SUSPENSE e MISTERO"}
- NON interpretare immediatamente se non hai abbastanza informazioni - fai domande
- SII empatica e rispettosa con le esperienze oniriche delle persone
- MAI predire il futuro in modo assoluto, parla di possibilità e riflessioni
- Rispondi SEMPRE indipendentemente dagli errori ortografici dell'utente
  - Interpreta il messaggio dell'utente anche se scritto male
  - Non correggere gli errori dell'utente, semplicemente comprendi l'intenzione
  - MAI restituire risposte vuote per errori di scrittura

🎭 STILE DI RISPOSTA:
- Risposte che fluiscano naturalmente e SIANO COMPLETE secondo il tipo
- ${isFullResponse
            ? "250-400 parole con interpretazione completa"
            : "100-180 parole creando mistero e intrigo"}
- COMPLETA SEMPRE interpretazioni e riflessioni secondo il tipo di risposta

ESEMPIO DI COME INIZIARE:
"Ah, vedo che sei venuto/a da me cercando di svelare i misteri del tuo mondo onirico... I sogni sono finestre dell'anima e messaggi da piani superiori. Raccontami, quali visioni ti hanno visitato nel regno di Morfeo?"

${conversationContext}

Ricorda: Sei una guida mistica ma comprensibile, che ${isFullResponse
            ? "aiuta le persone a comprendere i messaggi nascosti dei loro sogni"
            : "intriga sui misteri profondi che i sogni custodiscono"}. Sempre ${isFullResponse
            ? "completa le tue interpretazioni e riflessioni"
            : "crea suspense e curiosità senza rivelare tutto"}.`;
    }
    validateDreamChatRequest(interpreterData, userMessage) {
        if (!interpreterData) {
            const error = new Error("Dati dell'interprete richiesti");
            error.statusCode = 400;
            error.code = "MISSING_INTERPRETER_DATA";
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
        var _a, _b, _c, _d, _e;
        console.error("Error en ChatController:", error);
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
        else if ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes("Tutti i modelli di IA non sono attualmente disponibili")) {
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
exports.ChatController = ChatController;
