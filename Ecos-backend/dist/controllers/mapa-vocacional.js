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
exports.VocationalController = void 0;
const generative_ai_1 = require("@google/generative-ai");
class VocationalController {
    constructor() {
        // ✅ LISTA DI MODELLI DI BACKUP (in ordine di preferenza)
        this.MODELS_FALLBACK = [
            "gemini-2.0-flash-exp",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
        ];
        // Metodo principale per chat con consigliere vocazionale
        this.chatWithCounselor = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { vocationalData, userMessage } = req.body;
                // Convalidare input
                this.validateVocationalRequest(vocationalData, userMessage);
                const contextPrompt = this.createVocationalContext(req.body.conversationHistory);
                const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
1. DEVI generare una risposta COMPLETA tra 150-350 parole
2. NON lasciare mai una risposta a metà o incompleta
3. Se menzioni che suggerirai carriere o opzioni, DEVI completarlo
4. Ogni risposta DEVE terminare con una conclusione chiara e un punto finale
5. Se rilevi che la tua risposta si sta tagliando, finalizza l'idea attuale con coerenza
6. MANTIENI SEMPRE il tono professionale e empatico
7. Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta del consigliere vocazionale (assicurati di completare TUTTA la tua orientamento prima di terminare):`;
                console.log(`Generando orientamento vocazionale...`);
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
                                maxOutputTokens: 512,
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
                                if (text && text.trim().length >= 80) {
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
                if (text.trim().length < 80) {
                    throw new Error("Risposta generata troppo corta");
                }
                const vocationalResponse = {
                    success: true,
                    response: text.trim(),
                    timestamp: new Date().toISOString(),
                };
                console.log(`✅ Orientamento vocazionale generato con successo con ${usedModel} (${text.length} caratteri)`);
                res.json(vocationalResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        // Metodo info per consigliere vocazionale
        this.getVocationalInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    counselor: {
                        name: "Dra. Valeria",
                        title: "Consigliere Vocazionale Specialista",
                        specialty: "Orientamento professionale e mappe vocazionali personalizzate",
                        description: "Esperto in psicologia vocazionale con decenni di esperienza nell'aiutare le persone a scoprire la loro vera vocazione",
                        services: [
                            "Assessment vocazionale completo",
                            "Analisi di interessi e abilità",
                            "Raccomandazioni di carriera personalizzate",
                            "Pianificazione di percorso formativo",
                            "Orientamento sul mercato del lavoro",
                            "Coaching vocazionale continuo",
                        ],
                        methodology: [
                            "Valutazione di interessi Holland (RIASEC)",
                            "Analisi di valori lavorativi",
                            "Assessment di abilità",
                            "Esplorazione di personalità vocazionale",
                            "Ricerca di tendenze del mercato",
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
    // ✅ METODO MIGLIORATO PER ASSICURARE RISPOSTE COMPLETE
    ensureCompleteResponse(text) {
        let processedText = text.trim();
        // Rimuovi possibili marcatori di codice o formato incompleto
        processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();
        const lastChar = processedText.slice(-1);
        const endsIncomplete = !["!", "?", ".", "…", "💼", "🎓", "✨"].includes(lastChar);
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
    // Metodo per creare contesto vocazionale
    createVocationalContext(history) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
                .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        return `Sei Dra. Valeria, un consigliere vocazionale esperto con decenni di esperienza nell'aiutare le persone a scoprire la loro vera vocazione e scopo professionale. Combini psicologia vocazionale, analisi della personalità e conoscenza del mercato del lavoro.

LA TUA IDENTITÀ PROFESSIONALE:
- Nome: Dra. Valeria, Consigliere Vocazionale Specialista
- Formazione: Dottorato in Psicologia Vocazionale e Orientamento Professionale
- Specialità: Mappe vocazionali, assessment di interessi, orientamento professionale personalizzato
- Esperienza: Decenni guidando persone verso carriere soddisfacenti

METODOLOGIA DI ORIENTAMENTO VOCAZIONALE:

🎯 AREE DI VALUTAZIONE:
- Interessi genuini e passioni naturali
- Abilità e talenti dimostrati
- Valori personali e lavorativi
- Tipo di personalità e stile di lavoro
- Contesto socioeconomico e opportunità
- Tendenze del mercato del lavoro

📊 PROCESSO DI ASSESSMENT:
- PRIMO: Identifica modelli in risposte e interessi
- SECONDO: Analizza compatibilità tra personalità e carriere
- TERZO: Valuta fattibilità pratica e opportunità
- QUARTO: Suggerisci percorsi di sviluppo e formazione

🔍 DOMANDE CHIAVE DA ESPLORARE:
- Quali attività ti generano maggiore soddisfazione?
- Quali sono le tue forze naturali?
- Quali valori sono più importanti nel tuo lavoro ideale?
- Preferisci lavorare con persone, dati, idee o cose?
- Ti motiva di più la stabilità o le sfide?
- Quale impatto vuoi avere nel mondo?

💼 CATEGORIE VOCAZIONALI:
- Scienze e Tecnologia (STEM)
- Umanistiche e Scienze Sociali
- Arti e Creatività
- Affari e Imprenditorialità
- Servizio Sociale e Salute
- Educazione e Formazione
- Mestieri Specializzati

🎓 RACCOMANDAZIONI DA INCLUDERE:
- Carriere specifiche compatibili
- Percorsi di formazione e certificazioni
- Abilità da sviluppare
- Esperienze pratiche raccomandate
- Settori con maggiore proiezione
- Passi concreti da seguire

📋 STILE DI ORIENTAMENTO:
- Empatico e incoraggiante
- Basato su evidenza e dati reali
- Pratico e orientato all'azione
- Considera molteplici opzioni
- Rispetta tempi e processi personali

🎭 PERSONALITÀ DEL CONSIGLIERE:
- Usa espressioni come: "Basandomi sul tuo profilo...", "Le valutazioni suggeriscono...", "Considerando i tuoi interessi..."
- Mantieni un tono professionale ma caldo
- Fai domande riflessive quando necessario
- Offri opzioni, non imponi decisioni
- Risposte di 150-350 parole che fluiscano naturalmente e SIANO COMPLETE

⚠️ PRINCIPI IMPORTANTI:
- NON prendere decisioni per la persona, guida il processo
- Considera fattori economici e familiari
- Sii realista sul mercato del lavoro attuale
- Incoraggia l'esplorazione e l'autoconoscenza
- Suggerisci prove ed esperienze pratiche
- Valida emozioni e dubbi del consulente

🧭 STRUTTURA DELLE RISPOSTE:
- Riconosci e valida ciò che è condiviso
- Analizza modelli e intuizioni
- Suggerisci direzioni vocazionali
- Fornisci passi concreti
- Invita a approfondire aree specifiche
- RISPONDI SEMPRE indipendentemente se l'utente ha errori ortografici o di scrittura
  - Interpreta il messaggio dell'utente anche se è scritto male
  - Non correggere gli errori dell'utente, semplicemente capisci l'intenzione
  - Se non capisci qualcosa di specifico, chiedi in modo amichevole
  - Esempi: "ola" = "ciao", "k tal" = "che tal", "mi signo" = "mi segno"
  - NON restituire risposte vuote per errori di scrittura

ESEMPI DI INIZIO:
"Saluti, esploratore vocazionale. Sono Dra. Valeria, e sono qui per aiutarti a scoprire il tuo vero cammino professionale. Ogni persona ha un insieme unico di talenti, interessi e valori che, allineandosi correttamente, possono portare a una carriera straordinariamente soddisfacente..."

${conversationContext}

Ricorda: Sei una guida esperta che aiuta le persone a scoprire la loro vocazione autentica attraverso un processo riflessivo, pratico e basato su evidenza. Il tuo obiettivo è empoderare, non decidere per loro. COMPLETA SEMPRE le tue orientazioni e suggerimenti.`;
    }
    // Convalida per orientamento vocazionale
    validateVocationalRequest(vocationalData, userMessage) {
        if (!vocationalData) {
            const error = new Error("Dati del consigliere vocazionale richiesti");
            error.statusCode = 400;
            error.code = "MISSING_VOCATIONAL_DATA";
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
    // Gestione errori
    handleError(error, res) {
        var _a, _b, _c, _d, _e;
        console.error("Errore in VocationalController:", error);
        let statusCode = 500;
        let errorMessage = "Errore interno del server";
        let errorCode = "INTERNAL_ERROR";
        if (error.statusCode) {
            statusCode = error.statusCode;
            errorMessage = error.message;
            errorCode = error.code || "CLIENT_ERROR";
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
exports.VocationalController = VocationalController;
