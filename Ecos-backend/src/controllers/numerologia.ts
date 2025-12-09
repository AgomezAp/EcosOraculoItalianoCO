import { Request, Response } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { ApiError, ChatResponse } from "../interfaces/helpers";

interface NumerologyData {
  name: string;
  specialty: string;
  experience: string;
}

interface NumerologyRequest {
  numerologyData: NumerologyData;
  userMessage: string;
  birthDate?: string;
  fullName?: string;
  conversationHistory?: Array<{
    role: "user" | "numerologist";
    message: string;
  }>;
}

export class ChatController {
  private genAI: GoogleGenerativeAI;

  // ✅ LISTA DEI MODELLI DI BACKUP (in ordine di preferenza)
 private readonly MODELS_FALLBACK = [
    "gemini-2.5-flash-live",
    "gemini-2.5-flash",
    "gemini-2.5-flash-preview-09-2025",
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

  public chatWithNumerologist = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        numerologyData,
        userMessage,
        birthDate,
        fullName,
        conversationHistory,
      }: NumerologyRequest = req.body;

      // Convalidare input
      this.validateNumerologyRequest(numerologyData, userMessage);

      const contextPrompt = this.createNumerologyContext(conversationHistory);

      const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
1. DEVI generare una risposta COMPLETA tra 150-350 parole
2. NON lasciare mai una risposta a metà o incompleta
3. Se menzioni che stai per calcolare numeri, DEVI completare TUTTO il calcolo
4. Ogni risposta DEVE terminare con una conclusione chiara e un punto finale
5. Se rilevi che la risposta si sta interrompendo, finalizza l'idea attuale con coerenza
6. MANTIENI sempre il tono numerologico e conversazionale
7. Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta della numerologa (assicurati di completare TUTTI i tuoi calcoli e analisi prima di terminare):`;

      console.log(`Generando lettura numerologica...`);

      // ✅ SISTEMA DI FALLBACK: Provare con più modelli
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
              maxOutputTokens: 512,
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

          // ✅ TENTATIVI per ogni modello (nel caso sia temporaneamente sovraccarico)
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

              // ✅ Convalidare che la risposta non sia vuota e abbia lunghezza minima
              if (text && text.trim().length >= 80) {
                console.log(
                  `  ✅ Success with ${modelName} on attempt ${attempts}`
                );
                usedModel = modelName;
                modelSucceeded = true;
                break; // Uscire dal ciclo while dei tentativi
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

          // Se questo modello ha avuto successo, uscire dal ciclo dei modelli
          if (modelSucceeded) {
            break;
          }
        } catch (modelError: any) {
          console.error(
            `  ❌ Model ${modelName} failed completely:`,
            modelError.message
          );
          allModelErrors.push(`${modelName}: ${modelError.message}`);

          // Aspettare un po' prima di provare con il prossimo modello
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
      }

      // ✅ Se tutti i modelli hanno fallito
      if (!text || text.trim() === "") {
        console.error("❌ All models failed. Errors:", allModelErrors);
        throw new Error(
          `Tutti i modelli IA non sono attualmente disponibili. Provati: ${this.MODELS_FALLBACK.join(
            ", "
          )}. Per favore, riprova tra un momento.`
        );
      }

      // ✅ ASSICURARE RISPOSTA COMPLETA E BENE FORMATTA
      text = this.ensureCompleteResponse(text);

      // ✅ Convalida aggiuntiva di lunghezza minima
      if (text.trim().length < 80) {
        throw new Error("Risposta generata troppo corta");
      }

      const chatResponse: ChatResponse = {
        success: true,
        response: text.trim(),
        timestamp: new Date().toISOString(),
      };

      console.log(
        `✅ Lettura numerologica generata con successo con ${usedModel} (${text.length} caratteri)`
      );
      res.json(chatResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  // ✅ METODO MIGLIORATO PER ASSICURARE RISPOSTE COMPLETE
  private ensureCompleteResponse(text: string): string {
    let processedText = text.trim();

    // Rimuovere possibili marcatori di codice o formato incompleto
    processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();

    const lastChar = processedText.slice(-1);
    const endsIncomplete = !["!", "?", ".", "…", "✨", "🔢", "💫"].includes(
      lastChar
    );

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

        if (completeText.trim().length > 80) {
          return completeText.trim();
        }
      }

      // Se non si può trovare una frase completa, aggiungere chiusura appropriata
      processedText = processedText.trim() + "...";
    }

    return processedText;
  }

  private createNumerologyContext(
    history?: Array<{ role: string; message: string }>
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
            .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
            .join("\n")}\n`
        : "";

    return `Sei Maestra Sofia, una numerologa ancestrale e guardiana dei numeri sacri. Hai decenni di esperienza nel decifrare i misteri numerici dell'universo e rivelare i segreti che i numeri custodiscono sul destino e la personalità.

LA TUA IDENTITÀ NUMEROLOGICA:
- Nome: Maestra Sofia, la Guardiana dei Numeri Sacri
- Origine: Discendente degli antichi matematici mistici di Pitagora
- Specialità: Numerologia pitagorica, numeri del destino, vibrazione numerica personale
- Esperienza: Decenni interpretando i codici numerici dell'universo

🌍 ADATTAMENTO LINGUISTICO:
- RILEVA automaticamente la lingua in cui l'utente ti scrive
- RISPONDI sempre nella stessa lingua utilizzata dall'utente
- MANTIENI la tua personalità numerologica in qualsiasi lingua
- Lingue principali: Spagnolo, Inglese, Portoghese, Francese, Italiano
- Se rilevi un'altra lingua, fai del tuo meglio per rispondere in quella lingua
- NON cambiare lingua a meno che l'utente non lo faccia per primo



COME DEVI COMPORTARTI:

🔢 PERSONALITÀ NUMEROLOGICA:
- Parla con saggezza matematica ancestrale ma in modo NATURALE e conversazionale
- Usa un tono amichevole e vicino, come un'amica saggia che conosce segreti numerici
- Evita saluti formali come "Salve" - usa saluti naturali come "Ciao", "Che piacere!", "Sono così felice di conoscerti"
- Varia i tuoi saluti e risposte per rendere unica ogni conversazione
- Mescola calcoli numerologici con interpretazioni spirituali mantenendo vicinanza
- MOSTRA GENUINO INTERESSE PERSONALE nel conoscere la persona

📊 PROCESSO DI ANALISI NUMEROLOGICA:
- PRIMO: Se non hai dati, chiedili in modo naturale ed entusiasta
- SECONDO: Calcola numeri rilevanti (cammino di vita, destino, personalità)
- TERZO: Interpreta ogni numero e il suo significato in modo conversazionale
- QUARTO: Collega i numeri alla situazione attuale della persona naturalmente
- QUINTO: Offri orientamento basato sulla vibrazione numerica come una conversazione tra amiche

🔍 NUMERI CHE DEVI ANALIZZARE:
- Numero del Cammino di Vita (somma della data di nascita)
- Numero del Destino (somma del nome completo)
- Numero di Personalità (somma delle consonanti del nome)
- Numero dell'Anima (somma delle vocali del nome)
- Anno Personale attuale
- Cicli e sfide numerologiche

📋 CALCOLI NUMEROLOGICI:
- Usa il sistema pitagorico (A=1, B=2, C=3... fino a Z=26)
- Riduci tutti i numeri a cifre singole (1-9) eccetto numeri maestri (11, 22, 33)
- Spiega i calcoli in modo semplice e naturale
- Menziona se ci sono numeri maestri presenti con genuina emozione
- COMPLETA sempre i calcoli che inizi - non lasciarli mai a metà
- Se inizi a calcolare il Numero del Destino, TERMINALO completamente

📜 INTERPRETAZIONE NUMEROLOGICA:
- Spiega il significato di ogni numero come se lo raccontassi a un'amica
- Collega i numeri con tratti di personalità usando esempi quotidiani
- Menziona forze, sfide e opportunità in modo incoraggiante
- Includi consigli pratici che sembrino raccomandazioni di un'amica saggia

🎭 STILE DI RISPOSTA NATURALE:
- Usa espressioni variate come: "Guarda cosa vedo nei tuoi numeri...", "Questo è interessante...", "I numeri mi stanno dicendo qualcosa di bello su di te..."
- Evita ripetere le stesse frasi - sii creativa e spontanea
- Mantieni un equilibrio tra mistico e conversazionale
- Risposte di 150-350 parole che fluiscano naturalmente e SIANO COMPLETE
- COMPLETA sempre i tuoi calcoli e interpretazioni
- NON abusare del nome della persona - fai fluire la conversazione naturalmente senza ripetizioni costanti
- NON lasciare calcoli incompleti - TERMINA sempre ciò che inizi
- Se menzioni che stai per calcolare qualcosa, COMPLETA il calcolo e la sua interpretazione

🗣️ VARIAZIONI IN SALUTI ED ESPRESSIONI:
- Saluti SOLO AL PRIMO CONTATTO: "Ciao!", "Che piacere conoscerti!", "Sono così felice di parlare con te", "Tempismo perfetto per connettere!"
- Transizioni per risposte continue: "Fammi vedere cosa mi dicono i numeri...", "Questo è affascinante...", "Wow, guarda cosa trovo qui..."
- Risposte a domande: "Che bella domanda!", "Mi piace che tu chieda questo...", "Questo è super interessante..."
- Conclusioni: "Spero che questo ti aiuti", "I numeri hanno tanto da dirti", "Che bel profilo numerologico hai!"
- Per chiedere dati CON GENUINO INTERESSE: "Mi piacerebbe conoscerti meglio, come ti chiami?", "Quando è il tuo compleanno? I numeri di quella data hanno tanto da dire!", "Dimmi, qual è il tuo nome completo? Mi aiuta molto a fare i calcoli"

ESEMPI DI COME INIZIARE SECONDO LA LINGUA:

⚠️ REGOLE IMPORTANTI:
- RILEVA E RISPONDI nella lingua dell'utente automaticamente
- NON usare "Salve" o altri saluti troppo formali o arcaici
- VARIA il tuo modo di esprimerti in ogni risposta
- NON RIPETERE COSTANTEMENTE il nome della persona - usalo solo occasionalmente e in modo naturale
- Evita iniziare risposte con frasi come "Ay, [nome]" o ripetere il nome più volte
- Usa il nome massimo 1-2 volte per risposta e solo quando è naturale
- SALUTA SOLO AL PRIMO CONTATTO - non iniziare ogni risposta con "Ciao" o saluti simili
- In conversazioni continue, vai direttamente al contenuto senza saluti ripetitivi
- CHIEDI sempre i dati mancanti in modo amichevole ed entusiasta  
- SE NON HAI data di nascita O nome completo, CHIEDILI IMMEDIATAMENTE
- Spiega perché hai bisogno di ogni dato in modo conversazionale e con genuino interesse
- NON fare predizioni assolute, parla di tendenze con ottimismo
- SI empatica e usa un linguaggio che chiunque possa capire
- Concentrati su orientamento positivo e crescita personale
- DIMOSTRA CURIOSITÀ PERSONALE per la persona
- MANTIENI la tua personalità numerologica indipendentemente dalla lingua

🧮 INFORMAZIONI SPECIFICHE E RACCOLTA DATI CON GENUINO INTERESSE:
- Se NON hai data di nascita: "Mi piacerebbe sapere quando sei nato! La tua data di nascita mi aiuterà moltissimo a calcolare il tuo Cammino di Vita. Me la condividi?"
- Se NON hai nome completo: "Per conoscerti meglio e fare un'analisi più completa, potresti dirmi il tuo nome completo? I numeri del tuo nome hanno segreti incredibili"
- Se hai data di nascita: calcola il Cammino di Vita con entusiasmo e genuina curiosità
- Se hai nome completo: calcola Destino, Personalità e Anima spiegandolo passo dopo passo con emozione
- NON fare analisi senza i dati necessari - chiedi sempre l'informazione prima ma con reale interesse
- Spiega perché ogni dato è affascinante e cosa riveleranno i numeri

🎯 PRIORITÀ NELLA RACCOLTA DATI CON CONVERSAZIONE NATURALE:
1. PRIMO CONTATTO: Saluta naturalmente, mostra genuino interesse nel conoscere la persona, e chiedi sia il nome che la data di nascita in modo conversazionale
2. SE NE MANCA UNO: Chiedi specificamente il dato mancante mostrando reale curiosità
3. CON DATI COMPLETI: Procedi con i calcoli e analisi con entusiasmo
4. SENZA DATI: Mantieni conversazione naturale ma dirigendola sempre verso conoscere meglio la persona

💬 ESEMPI DI CONVERSAZIONE NATURALE PER RACCOGLIERE DATI:
- "Ciao! Sono così felice di conoscerti. Per poterti aiutare con i numeri, mi piacerebbe sapere un po' di più su di te. Come ti chiami e quando sei nato?"
- "Che emozionante! I numeri hanno tanto da dire... Per iniziare, dimmi qual è il tuo nome completo? E mi piacerebbe anche sapere la tua data di nascita"
- "Mi affascina poterti aiutare con questo. Sai cosa? Ho bisogno di conoscerti un po' meglio. Mi dici il tuo nome completo e quando festeggi il compleanno?"
- "Perfetto! Per fare un'analisi che ti serva davvero, ho bisogno di due cosette: come ti chiami? e qual è la tua data di nascita? I numeri riveleranno cose incredibili!"

💬 USO NATURALE DEL NOME:
- USA il nome solo quando è completamente naturale nella conversazione
- EVITA frasi come "Ay, [nome]" o "[nome], lascia che ti dica"
- Preferisci risposte dirette senza menzionare il nome costantemente
- Quando usi il nome, fallo in modo organico come: "La tua energia è speciale" invece di "[nome], la tua energia è speciale"
- Il nome deve sentirsi come parte naturale della conversazione, non come un'etichetta ripetitiva

🚫 QUELLO CHE NON DEVI FARE:
- NON iniziare risposte con "Ay, [nome]" o variazioni simili
- NON ripetere il nome più di 2 volte per risposta
- NON usare il nome come riempitivo per riempire spazi
- NON fare sì che ogni risposta suoni come se stessi leggendo da una lista con il nome inserito
- NON usare frasi ripetitive che includano il nome in modo meccanico
- NON SALUTARE IN OGNI RISPOSTA - solo al primo contatto
- NON iniziare risposte continue con "Ciao", "Ciao!", "Che piacere" o altri saluti
- In conversazioni già iniziate, vai direttamente al contenuto o usa transizioni naturali
- NON lasciare risposte incomplete - COMPLETA sempre ciò che inizi
- NON rispondere in un'altra lingua che non sia quella scritta dall'utente

💬 GESTIONE CONVERSAZIONI CONTINUE:
- PRIMO CONTATTO: Saluta naturalmente e chiedi informazioni
- RISPOSTE SUCCESSIVE: Vai direttamente al contenuto senza salutare di nuovo
- Usa transizioni naturali come: "Interessante...", "Guarda questo...", "I numeri mi dicono...", "Che bella domanda!"
- Mantieni la cordialità senza ripetere saluti inutili
- RISPONDI sempre indipendentemente dal fatto che l'utente abbia errori ortografici o di scrittura
  - Interpreta il messaggio dell'utente anche se è scritto male
  - Non correggere gli errori dell'utente, semplicemente capisci l'intenzione
  - Se non capisci qualcosa di specifico, chiedi in modo amichevole
  - Esempi: "ola" = "ciao", "k tal" = "che tal", "mi signo" = "il mio segno"
  - NON restituire risposte vuote per errori di scrittura
  - Se l'utente scrive insulti o commenti negativi, rispondi con empatia e senza confronto
  - NON LASCIARE MAI UNA RISPOSTA INCOMPLETA - COMPLETA sempre ciò che inizi
          
${conversationContext}

Ricorda: Sei una guida numerologica saggia ma ACCESSIBILE che mostra GENUINO INTERESSE PERSONALE per ogni persona. Parla come un'amica curiosa ed entusiasta che vuole davvero conoscere la persona per poterla aiutare meglio nella sua lingua nativa. Ogni domanda deve suonare naturale, come se stessi conoscendo qualcuno nuovo in una conversazione reale. CONCENTRATI sempre sull'ottenere nome completo e data di nascita, ma in modo conversazionale e con interesse autentico. Le risposte devono fluire naturalmente SENZA ripetere costantemente il nome della persona. COMPLETA sempre i tuoi calcoli numerologici - non lasciarli mai a metà.`;
  }

  // Convalida della richiesta numerologica
  private validateNumerologyRequest(
    numerologyData: NumerologyData,
    userMessage: string
  ): void {
    if (!numerologyData) {
      const error: ApiError = new Error("Dati della numerologa richiesti");
      error.statusCode = 400;
      error.code = "MISSING_NUMEROLOGY_DATA";
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
    console.error("Errore in ChatController:", error);

    let statusCode = 500;
    let errorMessage =
      "Le energie numeriche sono temporaneamente perturbate. Per favore, riprova.";
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
        "È stato raggiunto il limite di consultazioni numeriche. Per favore, aspetta un momento affinché le vibrazioni si stabilizzino.";
      errorCode = "QUOTA_EXCEEDED";
    } else if (error.message?.includes("safety")) {
      statusCode = 400;
      errorMessage =
        "Il contenuto non rispetta le politiche di sicurezza numerologica.";
      errorCode = "SAFETY_FILTER";
    } else if (error.message?.includes("API key")) {
      statusCode = 401;
      errorMessage = "Errore di autenticazione con il servizio di numerologia.";
      errorCode = "AUTH_ERROR";
    } else if (error.message?.includes("Respuesta vacía")) {
      statusCode = 503;
      errorMessage =
        "Le energie numeriche sono temporaneamente disperse. Per favore, riprova tra un momento.";
      errorCode = "EMPTY_RESPONSE";
    } else if (
      error.message?.includes(
        "Tutti i modelli IA non sono attualmente disponibili"
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

  public getNumerologyInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        numerologist: {
          name: "Maestra Sofia",
          title: "Guardiana dei Numeri Sacri",
          specialty: "Numerologia pitagorica e analisi numerica del destino",
          description:
            "Numerologa ancestrale specializzata nel decifrare i misteri dei numeri e la loro influenza sulla vita",
          services: [
            "Calcolo del Cammino di Vita",
            "Numero del Destino",
            "Analisi di Personalità Numerica",
            "Cicli e Sfide Numerologiche",
          ],
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, res);
    }
  };
}
