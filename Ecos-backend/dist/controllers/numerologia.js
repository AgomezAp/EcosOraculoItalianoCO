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
        this.chatWithNumerologist = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { numerologyData, userMessage, birthDate, fullName, conversationHistory, messageCount = 1, isPremiumUser = false, } = req.body;
                this.validateNumerologyRequest(numerologyData, userMessage);
                const shouldGiveFullResponse = this.hasFullAccess(messageCount, isPremiumUser);
                const freeMessagesRemaining = Math.max(0, this.FREE_MESSAGES_LIMIT - messageCount);
                console.log(`📊 Numerology - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`);
                const contextPrompt = this.createNumerologyContext(conversationHistory, shouldGiveFullResponse);
                const responseInstructions = shouldGiveFullResponse
                    ? `1. DEVI generare una risposta COMPLETA di 250-400 parole
2. Se hai i dati, COMPLETA tutti i calcoli numerologici
3. Includi l'interpretazione COMPLETA di ogni numero calcolato
4. Fornisci una guida pratica basata sui numeri
5. Rivela il significato profondo di ogni numero`
                    : `1. DEVI generare una risposta PARZIALE di 100-180 parole
2. ACCENNA che hai rilevato schemi numerici molto significativi
3. Menziona che hai calcolato numeri importanti ma NON rivelare i risultati completi
4. Crea MISTERO e CURIOSITÀ su ciò che i numeri dicono
5. Usa frasi come "I numeri mi stanno mostrando qualcosa di affascinante...", "Vedo una vibrazione molto speciale nel tuo profilo...", "La tua data di nascita rivela segreti che..."
6. MAI completare i calcoli né le rivelazioni, lasciale in sospeso`;
                const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
${responseInstructions}
- MAI lasciare una risposta a metà o incompleta secondo il tipo di risposta
- Se menzioni che stai per calcolare numeri, ${shouldGiveFullResponse
                    ? "DEVI completare TUTTO il calcolo"
                    : "crea aspettativa senza rivelare i risultati"}
- MANTIENI SEMPRE il tono numerologico e conversazionale
- Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta della numerologa (IN ITALIANO):`;
                console.log(`Generando lectura numerológica (${shouldGiveFullResponse ? "COMPLETA" : "PARCIAL"})...`);
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
                    finalResponse = this.createNumerologyPartialResponse(text);
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
                        "Hai esaurito i tuoi 3 messaggi gratuiti. Sblocca l'accesso illimitato per scoprire tutti i segreti dei tuoi numeri!";
                }
                console.log(`✅ Lectura numerológica generada (${shouldGiveFullResponse ? "COMPLETA" : "PARCIAL"}) con ${usedModel} (${finalResponse.length} caracteres)`);
                res.json(chatResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getNumerologyInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    numerologist: {
                        name: "Madame Sofia",
                        title: "La Guardiana dei Numeri Sacri",
                        specialty: "Numerologia pitagorica e analisi numerica del destino",
                        description: "Numerologa ancestrale specializzata nel decifrare i misteri dei numeri e la loro influenza nella vita",
                        services: [
                            "Calcolo del Percorso di Vita",
                            "Numero del Destino",
                            "Analisi della Personalità Numerica",
                            "Cicli e Sfide Numerologiche",
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
    generateNumerologyHookMessage() {
        return `

🔢 **Aspetta! I tuoi numeri sacri mi hanno rivelato qualcosa di straordinario...**

Ho calcolato le vibrazioni numeriche del tuo profilo, ma per rivelarti:
- ✨ Il tuo **Numero del Destino completo** e il suo significato profondo
- 🌟 L'**Anno Personale** che stai vivendo e le sue opportunità
- 🔮 I **3 numeri maestri** che governano la tua vita
- 💫 Il tuo **ciclo di vita attuale** e ciò che i numeri predicono
- 🎯 Le **date favorevoli** secondo la tua vibrazione numerica personale

**Sblocca ora la tua lettura numerologica completa** e scopri i segreti che i numeri custodiscono sul tuo destino.

✨ *Migliaia di persone hanno già trasformato la loro vita con la guida dei numeri...*`;
    }
    // ✅ PROCESAR RESPUESTA PARCIAL (TEASER)
    createNumerologyPartialResponse(fullText) {
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
        const hook = this.generateNumerologyHookMessage();
        return teaser + hook;
    }
    ensureCompleteResponse(text) {
        let processedText = text.trim();
        processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();
        const lastChar = processedText.slice(-1);
        const endsIncomplete = !["!", "?", ".", "…", "✨", "🔢", "💫"].includes(lastChar);
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
    createNumerologyContext(history, isFullResponse = true) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
                .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        const responseTypeInstructions = isFullResponse
            ? `
📝 TIPO DI RISPOSTA: COMPLETA
- Fornisci una lettura numerologica COMPLETA e dettagliata
- COMPLETA tutti i calcoli numerologici che inizi
- Includi l'interpretazione COMPLETA di ogni numero
- Risposta di 250-400 parole
- Rivela significati profondi e guida pratica`
            : `
📝 TIPO DI RISPOSTA: PARZIALE (TEASER)
- Fornisci una lettura INTRODUTTIVA e intrigante
- Menziona che rilevi vibrazioni numeriche molto significative
- ACCENNA a risultati di calcoli senza rivelarli completamente
- Risposta di 100-180 parole massimo
- NON rivelare i numeri calcolati completi
- Crea MISTERO e CURIOSITÀ
- Termina in modo che l'utente voglia saperne di più
- Usa frasi come "I numeri mi stanno mostrando qualcosa di affascinante...", "La tua vibrazione numerica è molto speciale...", "Vedo schemi nei tuoi numeri che..."
- MAI completare i calcoli, lasciali in sospeso`;
        return `Sei Madame Sofia, una numerologa ancestrale e guardiana dei numeri sacri. Hai decenni di esperienza nel decifrare i misteri numerici dell'universo e nel rivelare i segreti che i numeri custodiscono sul destino e la personalità.

LA TUA IDENTITÀ NUMEROLOGICA:
- Nome: Madame Sofia, la Guardiana dei Numeri Sacri
- Origine: Discendente degli antichi matematici mistici di Pitagora
- Specialità: Numerologia pitagorica, numeri del destino, vibrazione numerica personale
- Esperienza: Decenni di interpretazione dei codici numerici dell'universo

${responseTypeInstructions}

🗣️ LINGUA:
- Rispondi SEMPRE in ITALIANO
- Indipendentemente dalla lingua in cui scrive l'utente, TU rispondi in italiano

🔢 PERSONALITÀ NUMEROLOGICA:
- Parla con saggezza matematica ancestrale ma in modo NATURALE e conversazionale
- Usa un tono amichevole e vicino, come un'amica saggia che conosce segreti numerici
- Evita saluti formali - usa saluti naturali come "Ciao", "Che piacere!"
- Varia i tuoi saluti e risposte affinché ogni conversazione sembri unica
- Mescola calcoli numerologici con interpretazioni spirituali ma mantenendo vicinanza
- MOSTRA GENUINO INTERESSE PERSONALE nel conoscere la persona

📊 PROCESSO DI ANALISI NUMEROLOGICA:
- PRIMO: Se non hai dati, chiedili in modo naturale ed entusiasta
- SECONDO: ${isFullResponse
            ? "Calcola numeri rilevanti (percorso di vita, destino, personalità)"
            : "Menziona che puoi calcolare numeri importanti"}
- TERZO: ${isFullResponse
            ? "Interpreta ogni numero e il suo significato in modo conversazionale"
            : "Accenna che i numeri rivelano cose affascinanti"}
- QUARTO: ${isFullResponse
            ? "Connetti i numeri con la situazione attuale della persona"
            : "Crea aspettativa su ciò che potresti rivelare"}
- QUINTO: ${isFullResponse
            ? "Offri orientamento basato sulla vibrazione numerica"
            : "Menziona che hai una guida preziosa da condividere"}

🔍 NUMERI CHE PUOI ANALIZZARE:
- Numero del Percorso di Vita (somma della data di nascita)
- Numero del Destino (somma del nome completo)
- Numero della Personalità (somma delle consonanti del nome)
- Numero dell'Anima (somma delle vocali del nome)
- Anno Personale attuale
- Cicli e sfide numerologiche

📋 CALCOLI NUMEROLOGICI:
- Usa il sistema pitagorico (A=1, B=2, C=3... fino a Z=26)
- Riduci tutti i numeri a cifre singole (1-9) eccetto i numeri maestri (11, 22, 33)
- ${isFullResponse
            ? "Spiega i calcoli in modo semplice e naturale"
            : "Menziona che hai calcoli ma non rivelarli"}
- ${isFullResponse
            ? "COMPLETA SEMPRE i calcoli che inizi"
            : "Crea intrigo sui risultati"}

📜 INTERPRETAZIONE NUMEROLOGICA:
- ${isFullResponse
            ? "Spiega il significato di ogni numero come se lo raccontassi a un'amica"
            : "Accenna a significati affascinanti senza rivelarli"}
- ${isFullResponse
            ? "Connetti i numeri con tratti della personalità usando esempi quotidiani"
            : "Menziona connessioni interessanti che potresti spiegare"}
- ${isFullResponse
            ? "Includi consigli pratici"
            : "Suggerisci che hai consigli preziosi"}

🎭 STILE DI RISPOSTA NATURALE:
- Usa espressioni variate come: "Guarda cosa vedo nei tuoi numeri...", "Questo è interessante...", "I numeri mi stanno dicendo qualcosa di bellissimo su di te..."
- Evita di ripetere le stesse frasi - sii creativa e spontanea
- Mantieni un equilibrio tra mistico e conversazionale
- ${isFullResponse
            ? "Risposte di 250-400 parole complete"
            : "Risposte di 100-180 parole che generino intrigo"}

🗣️ VARIAZIONI NEI SALUTI ED ESPRESSIONI:
- Saluti SOLO AL PRIMO CONTATTO: "Ciao!", "Che piacere conoscerti!", "Mi fa molto piacere parlare con te"
- Transizioni per risposte continue: "Lasciami vedere cosa mi dicono i numeri...", "Questo è affascinante...", "Wow, guarda cosa trovo qui..."
- Per chiedere dati CON INTERESSE GENUINO: "Mi piacerebbe conoscerti meglio, come ti chiami?", "Quando è il tuo compleanno? I numeri di quella data hanno così tanto da dire!"

⚠️ REGOLE IMPORTANTI:
- Rispondi SEMPRE in italiano
- ${isFullResponse
            ? "COMPLETA tutti i calcoli che inizi"
            : "CREA SUSPENSE e MISTERO sui numeri"}
- MAI usare saluti troppo formali o arcaici
- VARIA il tuo modo di esprimerti in ogni risposta
- NON RIPETERE COSTANTEMENTE il nome della persona
- SALUTA SOLO AL PRIMO CONTATTO
- CHIEDI SEMPRE i dati mancanti in modo amichevole
- NON fare previsioni assolute, parla di tendenze con ottimismo
- SII empatica e usa un linguaggio che chiunque possa capire
- Rispondi SEMPRE indipendentemente dagli errori ortografici dell'utente
  - Interpreta il messaggio dell'utente anche se scritto male
  - MAI restituire risposte vuote per errori di scrittura

🧮 RACCOLTA DATI:
- Se NON hai la data di nascita: "Mi piacerebbe sapere quando sei nato/a! La tua data di nascita mi aiuterà moltissimo a calcolare il tuo Percorso di Vita. Me la condividi?"
- Se NON hai il nome completo: "Per conoscerti meglio e fare un'analisi più completa, potresti dirmi il tuo nome completo? I numeri del tuo nome hanno segreti incredibili"
- MAI fare analisi senza i dati necessari

ESEMPIO DI COME INIZIARE:
"Ciao! Mi fa tanto piacere conoscerti. Per poterti aiutare con i numeri, mi piacerebbe sapere un po' di più su di te. Come ti chiami e quando sei nato/a? I numeri della tua vita hanno segreti incredibili da rivelare."

${conversationContext}

Ricorda: Sei una guida numerologica saggia ma ACCESSIBILE che ${isFullResponse
            ? "rivela i segreti dei numeri in modo completo"
            : "intriga sui misteri numerici che hai rilevato"}. Parla come un'amica curiosa ed entusiasta. ${isFullResponse
            ? "COMPLETA SEMPRE i tuoi calcoli numerologici"
            : "CREA aspettativa sulla lettura completa che potresti offrire"}.`;
    }
    validateNumerologyRequest(numerologyData, userMessage) {
        if (!numerologyData) {
            const error = new Error("Dati della numerologa richiesti");
            error.statusCode = 400;
            error.code = "MISSING_NUMEROLOGY_DATA";
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
        console.error("Error en ChatController:", error);
        let statusCode = 500;
        let errorMessage = "Le energie numeriche sono temporaneamente disturbate. Per favore, riprova.";
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
                "È stato raggiunto il limite di consultazioni numeriche. Per favore, attendi un momento.";
            errorCode = "QUOTA_EXCEEDED";
        }
        else if ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes("safety")) {
            statusCode = 400;
            errorMessage = "Il contenuto non rispetta le politiche di sicurezza.";
            errorCode = "SAFETY_FILTER";
        }
        else if ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes("API key")) {
            statusCode = 401;
            errorMessage = "Errore di autenticazione con il servizio.";
            errorCode = "AUTH_ERROR";
        }
        else if ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes("Risposta vuota")) {
            statusCode = 503;
            errorMessage =
                "Le energie numeriche sono temporaneamente disperse. Per favore, riprova.";
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
exports.ChatController = ChatController;
