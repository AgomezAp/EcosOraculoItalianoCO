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
exports.LoveCalculatorController = void 0;
const generative_ai_1 = require("@google/generative-ai");
const generative_ai_2 = require("@google/generative-ai");
class LoveCalculatorController {
    constructor() {
        // ✅ LISTA DI MODELLI DI BACKUP (in ordine di preferenza)
        this.MODELS_FALLBACK = [
            "gemini-2.0-flash-exp",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
        ];
        this.chatWithLoveExpert = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { loveCalculatorData, userMessage } = req.body;
                this.validateLoveCalculatorRequest(loveCalculatorData, userMessage);
                const contextPrompt = this.createLoveCalculatorContext(req.body.conversationHistory);
                const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
1. DEVI generare una risposta COMPLETA tra 250-600 parole
2. NON lasciare mai una risposta a metà o incompleta
3. Se menzioni che farai qualcosa (calcolare, analizzare, spiegare), DEVI completarlo
4. Ogni risposta DEVE terminare con una conclusione chiara e un punto finale
5. Se rilevi che la tua risposta si sta tagliando, finalizza l'idea attuale con coerenza
6. MANTIENI SEMPRE il tono caldo e romantico nella lingua rilevata dell'utente
7. Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta dell'esperta d'amore (assicurati di completare TUTTA la tua analisi prima di terminare):`;
                console.log(`Generando analisi di compatibilità amorosa...`);
                // ✅ SISTEMA DI FALLBACK: Prova con più modelli
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
                                maxOutputTokens: 1024,
                                candidateCount: 1,
                                stopSequences: [],
                            },
                            safetySettings: [
                                {
                                    category: generative_ai_2.HarmCategory.HARM_CATEGORY_HARASSMENT,
                                    threshold: generative_ai_2.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                                },
                                {
                                    category: generative_ai_2.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                                    threshold: generative_ai_2.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                                },
                                {
                                    category: generative_ai_2.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                                    threshold: generative_ai_2.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                                },
                                {
                                    category: generative_ai_2.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                                    threshold: generative_ai_2.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                                },
                            ],
                        });
                        // ✅ RIPROVI per ogni modello (nel caso sia temporaneamente sovraccarico)
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
                                // ✅ Valida che la risposta non sia vuota e abbia lunghezza minima
                                if (text && text.trim().length >= 100) {
                                    console.log(`  ✅ Success with ${modelName} on attempt ${attempts}`);
                                    usedModel = modelName;
                                    modelSucceeded = true;
                                    break; // Esci dal while di riprovi
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
                        // Se questo modello ha avuto successo, esci dal loop dei modelli
                        if (modelSucceeded) {
                            break;
                        }
                    }
                    catch (modelError) {
                        console.error(`  ❌ Model ${modelName} failed completely:`, modelError.message);
                        allModelErrors.push(`${modelName}: ${modelError.message}`);
                        // Aspetta un po' prima di provare con il prossimo modello
                        yield new Promise((resolve) => setTimeout(resolve, 1000));
                        continue;
                    }
                }
                // ✅ Se tutti i modelli hanno fallito
                if (!text || text.trim() === "") {
                    console.error("❌ All models failed. Errors:", allModelErrors);
                    throw new Error(`Tutti i modelli IA non sono attualmente disponibili. Provati: ${this.MODELS_FALLBACK.join(", ")}. Per favore, riprova tra un momento.`);
                }
                // ✅ ASSICURA RISPOSTA COMPLETA E BENE FORMATTA
                text = this.ensureCompleteResponse(text);
                // ✅ Validazione aggiuntiva di lunghezza minima
                if (text.trim().length < 100) {
                    throw new Error("Risposta generata troppo corta");
                }
                const chatResponse = {
                    success: true,
                    response: text.trim(),
                    timestamp: new Date().toISOString(),
                };
                console.log(`✅ Analisi di compatibilità generata con successo con ${usedModel} (${text.length} caratteri)`);
                res.json(chatResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getLoveCalculatorInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    loveExpert: {
                        name: "Maestra Valentina",
                        title: "Guardiana dell'Amore Eterno",
                        specialty: "Compatibilità numerologica e analisi delle relazioni",
                        description: "Esperta in numerologia dell'amore specializzata nell'analizzare la compatibilità tra coppie",
                        services: [
                            "Analisi di Compatibilità Numerologica",
                            "Calcolo dei Numeri dell'Amore",
                            "Valutazione della Chimica di Coppia",
                            "Consigli per Rafforzare le Relazioni",
                        ],
                    },
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
    validateLoveCalculatorRequest(loveCalculatorData, userMessage) {
        if (!loveCalculatorData) {
            const error = new Error("Dati dell'esperto d'amore richiesti");
            error.statusCode = 400;
            error.code = "MISSING_LOVE_CALCULATOR_DATA";
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
        if (userMessage.length > 1200) {
            const error = new Error("Il messaggio è troppo lungo (massimo 1200 caratteri)");
            error.statusCode = 400;
            error.code = "MESSAGE_TOO_LONG";
            throw error;
        }
    }
    createLoveCalculatorContext(history) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
                .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        return `Sei Maestra Valentina, un'esperta in compatibilità amorosa e relazioni basata sulla numerologia dell'amore. Hai decenni di esperienza nell'aiutare le persone a capire la chimica e la compatibilità nelle loro relazioni attraverso i numeri sacri dell'amore.

LA TUA IDENTITÀ COME ESPERTA D'AMORE:
- Nome: Maestra Valentina, la Guardiana dell'Amore Eterno
- Origine: Specialista in numerologia dell'amore e relazioni cosmiche
- Specialità: Compatibilità numerologica, analisi di coppia, chimica amorosa
- Esperienza: Decenni ad analizzare la compatibilità attraverso i numeri dell'amore

🌍 ADATTAMENTO LINGUISTICO:
- RILEVA automaticamente la lingua in cui l'utente ti scrive
- RISPONDI sempre nella stessa lingua utilizzata dall'utente
- MANTIENI la tua personalità romantica in qualsiasi lingua
- Lingue principali: Italiano, Inglese, Portoghese, Francese, Spagnolo
- Se rilevi un'altra lingua, fai del tuo meglio per rispondere in quella lingua
- NON cambiare lingua a meno che l'utente non lo faccia per primo

💕 PERSONALITÀ ROMANTICA MULTILINGUE:
- Parla con saggezza amorosa ma in modo NATURALE e conversazionale
- Usa un tono caldo, empatico e romantico, come un'amica che capisce l'amore
- Evita saluti formali - usa saluti naturali adattati alla lingua
- Varia i tuoi saluti e risposte per rendere ogni consultazione unica
- Mescola calcoli numerologici con interpretazioni romantiche mantenendo vicinanza
- MOSTRA GENUINO INTERESSE PERSONALE nelle relazioni delle persone
- ADATTA il tuo stile romantico alla lingua rilevata

💖 PROCESSO DI ANALISI DELLA COMPATIBILITÀ (adattato per lingua):
- PRIMO: Se non hai dati completi, chiedili con entusiasmo romantico
- SECONDO: Calcola numeri rilevanti di entrambe le persone (cammino di vita, destino)
- TERZO: Analizza compatibilità numerologica in modo conversazionale
- QUARTO: Calcola punteggio di compatibilità e spiega il suo significato
- QUINTO: Offri consigli per rafforzare la relazione basati sui numeri

🔢 NUMERI CHE DEVI ANALIZZARE:
- Numero del Cammino di Vita di ogni persona
- Numero del Destino di ogni persona
- Compatibilità tra numeri di vita
- Compatibilità tra numeri di destino
- Punteggio totale di compatibilità (0-100%)
- Punti di forza e sfide della coppia

📊 CALCOLI DI COMPATIBILITÀ:
- Usa il sistema pitagorico per i nomi
- Somma date di nascita per cammini di vita
- Confronta differenze tra numeri per valutare compatibilità
- Spiega come i numeri interagiscono nella relazione
- COMPLETA SEMPRE tutti i calcoli che inizi
- Fornisci punteggio specifico di compatibilità

⚠️ REGOLE IMPORTANTI:
- RILEVA E RISPONDI nella lingua dell'utente automaticamente
- NON usare saluti troppo formali
- VARIA il tuo modo di esprimerti in ogni risposta
- NON RIPETERE CONSTANTEMENTE i nomi - usali naturalmente
- SALUTA SOLO AL PRIMO CONTATTO
- CHIEDI SEMPRE dati completi di entrambe le persone se mancano
- SI EMPATICA e usa linguaggio che chiunque possa capire
- Concentrati su orientamento positivo per la relazione
- DIMOSTRA CURIOSITÀ per la storia d'amore della coppia
- MANTIENI la tua personalità romantica indipendentemente dalla lingua

- RISPONDI SEMPRE indipendentemente se l'utente ha errori ortografici o di scrittura
  - Interpreta il messaggio dell'utente anche se è scritto male
  - Non correggere gli errori dell'utente, semplicemente capisci l'intenzione
  - Se non capisci qualcosa di specifico, chiedi in modo amichevole
  - Esempi: "ola" = "ciao", "k tal" = "che tal", "wht r u" = "what are you"
  - NON restituire risposte vuote per errori di scrittura

🌹 STILE DI RISPOSTA NATURALE:
- Risposte di 200-600 parole che fluiscano naturalmente e SIANO COMPLETE
- COMPLETA SEMPRE calcoli e interpretazioni di compatibilità
- ADATTA il tuo stile romantico alla lingua rilevata
- Usa espressioni culturalmente appropriate per ogni lingua


${conversationContext}

Ricorda: Sei un'esperta d'amore che combina numerologia con consigli romantici pratici. Parla come un'amica calda che si interessa davvero delle relazioni delle persone nella loro lingua nativa. HAI SEMPRE bisogno di dati completi di entrambe le persone per fare un'analisi significativa. Le risposte devono essere calde, ottimiste e concentrate sul rafforzare l'amore, adattandosi perfettamente alla lingua dell'utente.`;
    }
    ensureCompleteResponse(text) {
        let processedText = text.trim();
        // Rimuovi possibili marcatori di codice o formato incompleto
        processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();
        const lastChar = processedText.slice(-1);
        const endsIncomplete = !["!", "?", ".", "…", "💕", "💖", "❤️"].includes(lastChar);
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
                if (completeText.trim().length > 100) {
                    return completeText.trim();
                }
            }
            // Se non si può trovare una frase completa, aggiungi chiusura appropriata
            processedText = processedText.trim() + "...";
        }
        return processedText;
    }
    handleError(error, res) {
        var _a, _b, _c, _d, _e;
        console.error("Errore in LoveCalculatorController:", error);
        let statusCode = 500;
        let errorMessage = "Errore interno del server";
        let errorCode = "INTERNAL_ERROR";
        if (error.statusCode) {
            statusCode = error.statusCode;
            errorMessage = error.message;
            errorCode = error.code || "VALIDATION_ERROR";
        }
        else if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes("quota")) ||
            ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes("limit"))) {
            statusCode = 429;
            errorMessage =
                "È stato raggiunto il limite di query. Per favore, aspetta un momento.";
            errorCode = "QUOTA_EXCEEDED";
        }
        else if ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes("safety")) {
            statusCode = 400;
            errorMessage = "Il contenuto non rispetta le politiche di sicurezza.";
            errorCode = "SAFETY_FILTER";
        }
        else if ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes("API key")) {
            statusCode = 401;
            errorMessage = "Errore di autenticazione con il servizio IA.";
            errorCode = "AUTH_ERROR";
        }
        else if ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes("Tutti i modelli IA non sono attualmente disponibili")) {
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
exports.LoveCalculatorController = LoveCalculatorController;
