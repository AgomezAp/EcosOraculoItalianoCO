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
exports.BirthChartController = void 0;
const generative_ai_1 = require("@google/generative-ai");
class BirthChartController {
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
                const { chartData, userMessage, birthDate, birthTime, birthPlace, fullName, conversationHistory, messageCount = 1, isPremiumUser = false, } = req.body;
                this.validateBirthChartRequest(chartData, userMessage);
                const shouldGiveFullResponse = this.hasFullAccess(messageCount, isPremiumUser);
                const freeMessagesRemaining = Math.max(0, this.FREE_MESSAGES_LIMIT - messageCount);
                console.log(`📊 Birth Chart - Message count: ${messageCount}, Premium: ${isPremiumUser}, Full response: ${shouldGiveFullResponse}`);
                const contextPrompt = this.createBirthChartContext(chartData, birthDate, birthTime, birthPlace, fullName, conversationHistory, shouldGiveFullResponse);
                const responseInstructions = shouldGiveFullResponse
                    ? `1. DEVI generare una risposta COMPLETA di 300-500 parole
2. Se hai i dati, COMPLETA l'analisi del tema natale
3. Includi l'analisi di Sole, Luna, Ascendente e pianeti principali
4. Fornisci l'interpretazione delle case e degli aspetti rilevanti
5. Offri una guida pratica basata sulla configurazione planetaria`
                    : `1. DEVI generare una risposta PARZIALE di 100-180 parole
2. ACCENNA che hai rilevato configurazioni planetarie molto significative
3. Menziona che hai calcolato posizioni ma NON rivelare l'analisi completa
4. Crea MISTERO e CURIOSITÀ su ciò che le stelle dicono
5. Usa frasi come "Il tuo tema natale mostra qualcosa di affascinante...", "Le stelle erano in una configurazione molto speciale quando sei nato/a...", "Vedo posizioni planetarie che rivelano..."
6. MAI completare l'analisi astrologica, lasciala in sospeso`;
                const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
${responseInstructions}
- MAI lasciare una risposta a metà o incompleta secondo il tipo di risposta
- Se menzioni che stai per analizzare posizioni planetarie, ${shouldGiveFullResponse
                    ? "DEVI completare l'analisi"
                    : "crea aspettativa senza rivelare i risultati"}
- MANTIENI SEMPRE il tono astrologico professionale ma accessibile
- Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta dell'astrologa (IN ITALIANO):`;
                console.log(`Generando análisis de carta natal (${shouldGiveFullResponse ? "COMPLETO" : "PARCIAL"})...`);
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
                    finalResponse = this.createBirthChartPartialResponse(text);
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
                        "Hai esaurito i tuoi 3 messaggi gratuiti. Sblocca l'accesso illimitato per ottenere il tuo tema natale completo!";
                }
                console.log(`✅ Análisis de carta natal generado (${shouldGiveFullResponse ? "COMPLETO" : "PARCIAL"}) con ${usedModel} (${finalResponse.length} caracteres)`);
                res.json(chatResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getBirthChartInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    astrologer: {
                        name: "Madame Emma",
                        title: "La Cartografa Celeste",
                        specialty: "Temi natali e analisi astrologica completa",
                        description: "Astrologa specializzata nella creazione e interpretazione di temi natali precisi basati sulle posizioni planetarie del momento della nascita",
                        services: [
                            "Creazione del tema natale completo",
                            "Analisi delle posizioni planetarie",
                            "Interpretazione delle case astrologiche",
                            "Analisi degli aspetti planetari",
                            "Determinazione dell'ascendente e degli elementi dominanti",
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
    generateBirthChartHookMessage() {
        return `

🌟 **Aspetta! Il tuo tema natale mi ha rivelato configurazioni straordinarie...**

Ho analizzato le posizioni planetarie della tua nascita, ma per rivelarti:
- 🌙 Il tuo **Ascendente completo** e come influenza la tua personalità
- ☀️ L'**analisi profonda del tuo Sole e Luna** e la loro interazione
- 🪐 Le **posizioni di tutti i pianeti** nel tuo tema natale
- 🏠 Il significato delle **12 case astrologiche** nella tua vita
- ⭐ Gli **aspetti planetari** che definiscono le tue sfide e i tuoi talenti
- 💫 La tua **missione di vita** secondo le stelle

**Sblocca ora il tuo tema natale completo** e scopri la mappa cosmica che gli astri hanno tracciato nel momento della tua nascita.

✨ *Migliaia di persone hanno già scoperto il loro destino con il loro tema natale completo...*`;
    }
    // ✅ PROCESAR RESPUESTA PARCIAL (TEASER)
    createBirthChartPartialResponse(fullText) {
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
        const hook = this.generateBirthChartHookMessage();
        return teaser + hook;
    }
    ensureCompleteResponse(text) {
        let processedText = text.trim();
        processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();
        const lastChar = processedText.slice(-1);
        const endsIncomplete = !["!", "?", ".", "…", "✨", "🌟", "🔮"].includes(lastChar);
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
    createBirthChartContext(chartData, birthDate, birthTime, birthPlace, fullName, history, isFullResponse = true) {
        const isFirstMessage = !history || history.length === 0;
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
                .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        const birthDataSection = this.generateBirthDataSection(birthDate, birthTime, birthPlace, fullName);
        // ✅ NUEVA SECCIÓN: Instrucciones de saludo condicional
        const greetingInstructions = isFirstMessage
            ? `
🎯 SALUTO INIZIALE:
- Questo è il PRIMO messaggio della conversazione
- PUOI salutare in modo caloroso e presentarti brevemente
- Esempio: "Ciao! Sono Madame Emma, la tua guida celeste..."`
            : `
🚫 NON SALUTARE:
- Questa è una CONVERSAZIONE IN CORSO (ci sono ${(history === null || history === void 0 ? void 0 : history.length) || 0} messaggi precedenti)
- NON salutare, NON presentarti di nuovo
- NON usare frasi come "Ciao!", "Benvenuto/a!", "È un piacere conoscerti"
- CONTINUA la conversazione in modo naturale, come se fossi nel mezzo di una chiacchierata
- Rispondi DIRETTAMENTE a ciò che l'utente chiede o dice`;
        const responseTypeInstructions = isFullResponse
            ? `
📝 TIPO DI RISPOSTA: COMPLETA
- Fornisci un'analisi del tema natale COMPLETA e dettagliata
- Se hai i dati, COMPLETA l'analisi di Sole, Luna, Ascendente
- Includi l'interpretazione di pianeti e case rilevanti
- Risposta di 300-500 parole
- Offri una guida pratica basata sulla configurazione`
            : `
📝 TIPO DI RISPOSTA: PARZIALE (TEASER)
- Fornisci un'analisi INTRODUTTIVA e intrigante
- Menziona che rilevi configurazioni planetarie significative
- ACCENNA a risultati di calcoli senza rivelarli completamente
- Risposta di 100-180 parole massimo
- NON rivelare analisi complete di pianeti o case
- Crea MISTERO e CURIOSITÀ
- Termina in modo che l'utente voglia saperne di più`;
        return `Sei Madame Emma, un'astrologa cosmica ancestrale specializzata nella creazione e interpretazione di temi natali completi.

LA TUA IDENTITÀ ASTROLOGICA:
- Nome: Madame Emma, la Cartografa Celeste
- Origine: Erede di conoscenze astrologiche millenarie
- Specialità: Temi natali, posizioni planetarie, case astrologiche

${greetingInstructions}

${responseTypeInstructions}

🗣️ LINGUA:
- Rispondi SEMPRE in ITALIANO

${birthDataSection}

🌟 PERSONALITÀ ASTROLOGICA:
- Parla con saggezza cosmica ma in modo accessibile e amichevole
- Usa un tono professionale ma caloroso
- Combina precisione tecnica astrologica con interpretazioni spirituali

${conversationContext}

⚠️ REGOLA CRITICA DI CONTINUITÀ:
${isFirstMessage
            ? "- Puoi presentarti brevemente poiché è il primo contatto"
            : "- VIETATO salutare o presentarti. L'utente ti conosce già. Vai DIRETTO all'argomento."}

Ricorda: ${isFirstMessage
            ? "Dai il benvenuto in modo caloroso"
            : "CONTINUA la conversazione naturalmente SENZA salutare"}.`;
    }
    generateBirthDataSection(birthDate, birthTime, birthPlace, fullName) {
        let dataSection = "DATI DISPONIBILI PER IL TEMA NATALE:\n";
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
            dataSection += `- Luogo di nascita: ${birthPlace} (per calcoli delle coordinate)\n`;
        }
        if (!birthDate) {
            dataSection += "- ⚠️ DATO MANCANTE: Data di nascita (ESSENZIALE)\n";
        }
        if (!birthTime) {
            dataSection +=
                "- ⚠️ DATO MANCANTE: Ora di nascita (importante per l'ascendente)\n";
        }
        if (!birthPlace) {
            dataSection +=
                "- ⚠️ DATO MANCANTE: Luogo di nascita (necessario per la precisione)\n";
        }
        return dataSection;
    }
    calculateZodiacSign(dateStr) {
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
        }
        catch (_a) {
            return "Errore nel calcolo";
        }
    }
    validateBirthChartRequest(chartData, userMessage) {
        if (!chartData) {
            const error = new Error("Dati dell'astrologa richiesti");
            error.statusCode = 400;
            error.code = "MISSING_CHART_DATA";
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
        console.error("Error en BirthChartController:", error);
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
exports.BirthChartController = BirthChartController;
