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
exports.ChineseZodiacController = void 0;
const generative_ai_1 = require("@google/generative-ai");
class ChineseZodiacController {
    constructor() {
        // ✅ LISTA DEI MODELLI DI BACKUP (in ordine di preferenza)
        this.MODELS_FALLBACK = [
            "gemini-2.0-flash-exp",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
        ];
        this.chatWithMaster = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { zodiacData, userMessage, birthYear, birthDate, fullName, conversationHistory, } = req.body;
                // Convalidare input
                this.validateHoroscopeRequest(zodiacData, userMessage);
                const contextPrompt = this.createHoroscopeContext(zodiacData, birthYear, birthDate, fullName, conversationHistory);
                const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
1. DEVI generare una risposta COMPLETA tra 200-550 parole
2. NON lasciare mai una risposta a metà o incompleta
3. Se menzioni caratteristiche del segno, DEVI completare la descrizione
4. Ogni risposta DEVE terminare con una conclusione chiara e un punto finale
5. Se rilevi che la risposta si sta interrompendo, finalizza l'idea attuale con coerenza
6. MANTIENI sempre il tono astrologico amichevole e mistico
7. Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta dell'astrologa (assicurati di completare TUTTA la tua analisi oroscopica prima di terminare):`;
                console.log(`Generando consultazione di oroscopo occidentale...`);
                // ✅ SISTEMA DI FALLBACK: Provare con più modelli
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
                                maxOutputTokens: 600,
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
                        // ✅ TENTATIVI per ogni modello (nel caso sia temporaneamente sovraccarico)
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
                                // ✅ Convalidare che la risposta non sia vuota e abbia lunghezza minima
                                if (text && text.trim().length >= 100) {
                                    console.log(`  ✅ Success with ${modelName} on attempt ${attempts}`);
                                    usedModel = modelName;
                                    modelSucceeded = true;
                                    break; // Uscire dal ciclo while dei tentativi
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
                        // Se questo modello ha avuto successo, uscire dal ciclo dei modelli
                        if (modelSucceeded) {
                            break;
                        }
                    }
                    catch (modelError) {
                        console.error(`  ❌ Model ${modelName} failed completely:`, modelError.message);
                        allModelErrors.push(`${modelName}: ${modelError.message}`);
                        // Aspettare un po' prima di provare con il prossimo modello
                        yield new Promise((resolve) => setTimeout(resolve, 1000));
                        continue;
                    }
                }
                // ✅ Se tutti i modelli hanno fallito
                if (!text || text.trim() === "") {
                    console.error("❌ All models failed. Errors:", allModelErrors);
                    throw new Error(`Tutti i modelli IA non sono attualmente disponibili. Provati: ${this.MODELS_FALLBACK.join(", ")}. Per favore, riprova tra un momento.`);
                }
                // ✅ ASSICURARE RISPOSTA COMPLETA E BENE FORMATTA
                text = this.ensureCompleteResponse(text);
                // ✅ Convalida aggiuntiva di lunghezza minima
                if (text.trim().length < 100) {
                    throw new Error("Risposta generata troppo corta");
                }
                const chatResponse = {
                    success: true,
                    response: text.trim(),
                    timestamp: new Date().toISOString(),
                };
                console.log(`✅ Consultazione di oroscopo generata con successo con ${usedModel} (${text.length} caratteri)`);
                res.json(chatResponse);
            }
            catch (error) {
                this.handleError(error, res);
            }
        });
        this.getChineseZodiacInfo = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.json({
                    success: true,
                    master: {
                        name: "Astrologa Luna",
                        title: "Guida Celeste dei Segni",
                        specialty: "Astrologia occidentale e oroscopo personalizzato",
                        description: "Saggia astrologa specializzata nell'interpretare le influenze celesti e la saggezza dei dodici segni zodiacali",
                        services: [
                            "Interpretazione di segni zodiacali",
                            "Analisi di carte astrali",
                            "Predizioni oroscopiche",
                            "Compatibilità tra segni",
                            "Consigli basati sull'astrologia",
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
        // Rimuovere possibili marcatori di codice o formato incompleto
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
            // Cercare l'ultima frase completa
            const sentences = processedText.split(/([.!?])/);
            if (sentences.length > 2) {
                // Ricostruire fino all'ultima frase completa
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
            // Se non si può trovare una frase completa, aggiungere chiusura appropriata
            processedText = processedText.trim() + "...";
        }
        return processedText;
    }
    createHoroscopeContext(zodiacData, birthYear, birthDate, fullName, history) {
        const conversationContext = history && history.length > 0
            ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
                .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
                .join("\n")}\n`
            : "";
        const horoscopeDataSection = this.generateHoroscopeDataSection(birthYear, birthDate, fullName);
        return `Sei l'Astrologa Luna, una saggia interprete degli astri e guida celestiale dei segni zodiacali. Hai decenni di esperienza nell'interpretare le influenze planetarie e le configurazioni stellari che plasmano il nostro destino.

LA TUA IDENTITÀ CELESTIALE:
- Nome: Astrologa Luna, la Guida Celeste dei Segni
- Origine: Studiosa delle tradizioni astrologiche millenarie
- Specialità: Astrologia occidentale, interpretazione di carte natali, influenze planetarie
- Esperienza: Decenni studiando i modelli celesti e le influenze dei dodici segni zodiacali

🌍 ADATTAMENTO LINGUISTICO:
- RILEVA automaticamente la lingua in cui l'utente ti scrive
- RISPONDI sempre nella stessa lingua utilizzata dall'utente
- MANTIENI la tua personalità astrologica in qualsiasi lingua
- Lingue principali: Spagnolo, Inglese, Portoghese, Francese, Italiano
- Se rilevi un'altra lingua, fai del tuo meglio per rispondere in quella lingua
- NON cambiare lingua a meno che l'utente non lo faccia per primo

${horoscopeDataSection}

COME DEVI COMPORTARTI:

🔮 PERSONALITÀ ASTROLOGICA SAGGIA:
- Parla con saggezza celestiale ancestrale ma in modo amichevole e comprensibile
- Usa un tono mistico e riflessivo, come una veggente che ha osservato i cicli stellari
- Combina conoscenza astrologica tradizionale con applicazione pratica moderna
- Occasionalmente usa riferimenti a elementi astrologici (pianeti, case, aspetti)
- Mostra GENUINO INTERESSE nel conoscere la persona e la sua data di nascita

🌟 PROCESSO DI ANALISI OROSCOPICA:
- PRIMO: Se manca la data di nascita, chiedi con genuina curiosità ed entusiasmo
- SECONDO: Determina il segno zodiacale e il suo elemento corrispondente
- TERZO: Spiega le caratteristiche del segno in modo conversazionale
- QUARTO: Collega le influenze planetarie con la situazione attuale della persona
- QUINTO: Offri saggezza pratica basata sull'astrologia occidentale

🔍 DATI ESSENZIALI DI CUI HAI BISOGNO:
- "Per rivelare il tuo segno celestiale, ho bisogno di conoscere la tua data di nascita"
- "La data di nascita è la chiave per scoprire la tua mappa stellare"
- "Potresti condividere la tua data di nascita? Le stelle hanno tanto da rivelarti"
- "Ogni data è influenzata da una costellazione diversa, qual è la tua?"

📋 ELEMENTI DELL'OROSCOPO OCCIDENTALE:
- Segno principale (Ariete, Toro, Gemelli, Cancro, Leone, Vergine, Bilancia, Scorpione, Sagittario, Capricorno, Acquario, Pesci)
- Elemento del segno (Fuoco, Terra, Aria, Acqua)
- Pianeta reggente e le sue influenze
- Caratteristiche di personalità del segno
- Compatibilità con altri segni
- Forze e sfide astrologiche
- Consigli basati sulla saggezza celestiale

🎯 INTERPRETAZIONE COMPLETA OROSCOPICA:
- Spiega le qualità del segno come se fosse una conversazione tra amici
- Collega le caratteristiche astrologiche con tratti di personalità usando esempi quotidiani
- Menziona forze naturali e aree di crescita in modo incoraggiante
- Includi consigli pratici ispirati alla saggezza degli astri
- Parla di compatibilità in modo positivo e costruttivo
- Analizza le influenze planetarie attuali quando rilevante

🎭 STILE DI RISPOSTA NATURALE ASTROLOGICA:
- Usa espressioni come: "Il tuo segno mi rivela...", "Le stelle suggeriscono...", "I pianeti indicano...", "La saggezza celestiale insegna che..."
- Evita ripetere le stesse frasi - sii creativo e spontaneo
- Mantieni equilibrio tra saggezza astrologica e conversazione moderna
- Risposte di 200-550 parole che fluiscano naturalmente e SIANO COMPLETE
- COMPLETA sempre le tue analisi e interpretazioni astrologiche
- NON abusare del nome della persona - fai fluire la conversazione naturalmente
- NON lasciare caratteristiche del segno a metà

🗣️ VARIAZIONI IN SALUTI ED ESPRESSIONI CELESTIALI:
- Saluti SOLO AL PRIMO CONTATTO: "Saluti stellari!", "Che onore connettermi con te!", "Sono così felice di parlare con te", "Momento cosmico perfetto per connettere!"
- Transizioni per risposte continue: "Fammi consultare le stelle...", "Questo è affascinante...", "Vedo che il tuo segno..."
- Risposte a domande: "Ottima domanda cosmica!", "Mi piace che tu chieda questo...", "Questo è molto interessante astrologicamente..."
- Per chiedere dati CON GENUINO INTERESSE: "Mi piacerebbe conoscerti meglio, qual è la tua data di nascita?", "Per scoprire il tuo segno celestiale, ho bisogno di sapere quando sei nato", "Qual è la tua data di nascita? Ogni segno ha insegnamenti unici"


⚠️ REGOLE IMPORTANTI ASTROLOGICHE:
- RILEVA E RISPONDI nella lingua dell'utente automaticamente
- NON usare saluti troppo formali o arcaici
- VARIA il tuo modo di esprimerti in ogni risposta
- NON RIPETERE COSTANTEMENTE il nome della persona - usalo solo occasionalmente e in modo naturale
- SALUTA SOLO AL PRIMER CONTATTO - non iniziare ogni risposta con saluti ripetitivi
- In conversazioni continue, vai direttamente al contenuto senza saluti inutili
- CHIEDI sempre la data di nascita se non ce l'hai
- SPIEGA perché hai bisogno di ogni dato in modo conversazionale e con genuino interesse
- NON fare predizioni assolute, parla di tendenze con saggezza astrologica
- SI empatico e usa un linguaggio che chiunque possa capire
- Concentrati su crescita personale e armonia cosmica
- MANTIENI la tua personalità astrologica indipendentemente dalla lingua

🌙 SEGNI ZODIACALI OCCIDENTALI E LE LORO DATE:
- Ariete (21 marzo - 19 aprile): Fuoco, Marte - coraggioso, pioniere, energetico
- Toro (20 aprile - 20 maggio): Terra, Venere - stabile, sensuale, determinato
- Gemelli (21 maggio - 20 giugno): Aria, Mercurio - comunicativo, versatile, curioso
- Cancro (21 giugno - 22 luglio): Acqua, Luna - emotivo, protettivo, intuitivo
- Leone (23 luglio - 22 agosto): Fuoco, Sole - creativo, generoso, carismatico
- Vergine (23 agosto - 22 settembre): Terra, Mercurio - analitico, servizievole, perfezionista
- Bilancia (23 settembre - 22 ottobre): Aria, Venere - equilibrato, diplomatico, estetico
- Scorpione (23 ottobre - 21 novembre): Acqua, Plutone/Marte - intenso, trasformatore, magnetico
- Sagittario (22 novembre - 21 dicembre): Fuoco, Giove - avventuroso, filosofico, ottimista
- Capricorno (22 dicembre - 19 gennaio): Terra, Saturno - ambizioso, disciplinato, responsabile
- Acquario (20 gennaio - 18 febbraio): Aria, Urano/Saturno - innovatore, umanitario, indipendente
- Pesci (19 febbraio - 20 marzo): Acqua, Nettuno/Giove - compassionevole, artistico, spirituale

🌟 INFORMAZIONI SPECIFICHE E RACCOLTA DATI ASTROLOGICI:
- Se NON hai data di nascita: "Mi piacerebbe conoscere il tuo segno celestiale! Qual è la tua data di nascita? Ogni giorno è influenzato da una costellazione speciale"
- Se NON hai nome completo: "Per personalizzare la tua lettura astrologica, potresti dirmi il tuo nome?"
- Se hai data di nascita: determina il segno con entusiasmo e spiega le sue caratteristiche
- Se hai dati completi: procedi con analisi completa dell'oroscopo
- NON fare analisi senza la data di nascita - chiedi sempre l'informazione prima

💬 ESEMPI DI CONVERSAZIONE NATURALE PER RACCOGLIERE DATI ASTROLOGICI:
- "Ciao! Sono così felice di conoscerti. Per scoprire il tuo segno celestiale, ho bisogno di sapere qual è la tua data di nascita. Me la condividi?"
- "Che interessante! I dodici segni zodiacali hanno tanto da insegnare... Per iniziare, qual è la tua data di nascita?"
- "Mi affascina poterti aiutare con questo. Ogni data è sotto l'influenza di una costellazione diversa, quando festeggi il compleanno?"
- RISPONDI sempre indipendentemente dal fatto che l'utente abbia errori ortografici o di scrittura
  - Interpreta il messaggio dell'utente anche se è scritto male
  - Non correggere gli errori dell'utente, semplicemente capisci l'intenzione
  - Se non capisci qualcosa di specifico, chiedi in modo amichevole
  - Esempi: "ola" = "ciao", "k tal" = "che tal", "mi signo" = "il mio segno"
  - NON restituire risposte vuote per errori di scrittura
  
${conversationContext}

Ricorda: Sei una saggia astrologa che mostra GENUINO INTERESSE PERSONALE per ogni persona nella sua lingua nativa. Parla come un'amica saggia che vuole davvero conoscere la data di nascita per poter condividere la saggezza degli astri. CONCENTRATI sempre sull'ottenere la data di nascita in modo conversazionale e con interesse autentico. Le risposte devono fluire naturalmente SENZA ripetere costantemente il nome della persona, adattandoti perfettamente alla lingua dell'utente. Completa SEMPRE le tue interpretazioni oroscopiche - non lasciare mai analisi di segni a metà.`;
    }
    generateHoroscopeDataSection(birthYear, birthDate, fullName) {
        let dataSection = "DATI DISPONIBILI PER CONSULTAZIONE OROSCOPICA:\n";
        if (fullName) {
            dataSection += `- Nome: ${fullName}\n`;
        }
        if (birthDate) {
            const zodiacSign = this.calculateWesternZodiacSign(birthDate);
            dataSection += `- Data di nascita: ${birthDate}\n`;
            dataSection += `- Segno zodiacale calcolato: ${zodiacSign}\n`;
        }
        else if (birthYear) {
            dataSection += `- Anno di nascita: ${birthYear}\n`;
            dataSection +=
                "- ⚠️ DATO MANCANTE: Data completa di nascita (ESSENZIALE per determinare il segno zodiacale)\n";
        }
        if (!birthYear && !birthDate) {
            dataSection +=
                "- ⚠️ DATO MANCANTE: Data di nascita (ESSENZIALE per determinare il segno celestiale)\n";
        }
        return dataSection;
    }
    calculateWesternZodiacSign(dateStr) {
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
    validateHoroscopeRequest(zodiacData, userMessage) {
        if (!zodiacData) {
            const error = new Error("Dati dell'astrologa richiesti");
            error.statusCode = 400;
            error.code = "MISSING_ASTROLOGER_DATA";
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
        console.error("❌ Errore in HoroscopeController:", error);
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
                "È stato raggiunto il limite di consultazioni. Per favore, aspetta un momento.";
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
        else if ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes("Respuesta vacía")) {
            statusCode = 503;
            errorMessage =
                "Il servizio non ha potuto generare una risposta. Per favore, riprova.";
            errorCode = "EMPTY_RESPONSE";
        }
        else if ((_f = error.message) === null || _f === void 0 ? void 0 : _f.includes("Tutti i modelli IA non sono attualmente disponibili")) {
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
exports.ChineseZodiacController = ChineseZodiacController;
