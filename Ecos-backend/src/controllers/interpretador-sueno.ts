import { Request, Response } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";

import {
  ApiError,
  ChatRequest,
  ChatResponse,
  SaintData,
} from "../interfaces/helpers";

interface DreamInterpreterData {
  name: string;
  specialty: string;
  experience: string;
}

interface DreamChatRequest {
  interpreterData: DreamInterpreterData;
  userMessage: string;
  conversationHistory?: Array<{
    role: "user" | "interpreter";
    message: string;
  }>;
}

export class ChatController {
  private genAI: GoogleGenerativeAI;

  // ✅ LISTA DI MODELLI DI BACKUP (in ordine di preferenza)
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

  public chatWithDreamInterpreter = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        interpreterData,
        userMessage,
        conversationHistory,
      }: DreamChatRequest = req.body;

      // Convalidare input
      this.validateDreamChatRequest(interpreterData, userMessage);

      const contextPrompt = this.createDreamInterpreterContext(
        interpreterData,
        conversationHistory
      );

      const fullPrompt = `${contextPrompt}

⚠️ ISTRUZIONI CRITICHE OBBLIGATORIE:
1. DEVI generare una risposta COMPLETA tra 150-300 parole
2. NON lasciare mai una risposta a metà o incompleta
3. Se menzioni che interpreterai qualcosa, DEVI completarlo
4. Ogni risposta DEVE terminare con una conclusione chiara e un punto finale
5. Se rilevi che la tua risposta si sta tagliando, finalizza l'idea attuale con coerenza
6. MANTIENI SEMPRE il tono mistico e caldo nella lingua rilevata dell'utente
7. Se il messaggio ha errori ortografici, interpreta l'intenzione e rispondi normalmente

Utente: "${userMessage}"

Risposta dell'interprete di sogni (assicurati di completare TUTTA la tua interpretazione prima di terminare):`;

      console.log(`Generando interpretazione di sogni...`);

      // ✅ SISTEMA DI FALLBACK: Prova con più modelli
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

          // ✅ RIPROVI per ogni modello (nel caso sia temporaneamente sovraccarico)
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

              // ✅ Valida che la risposta non sia vuota e abbia lunghezza minima
              if (text && text.trim().length >= 80) {
                console.log(
                  `  ✅ Success with ${modelName} on attempt ${attempts}`
                );
                usedModel = modelName;
                modelSucceeded = true;
                break; // Esci dal while di riprovi
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

          // Se questo modello ha avuto successo, esci dal loop dei modelli
          if (modelSucceeded) {
            break;
          }
        } catch (modelError: any) {
          console.error(
            `  ❌ Model ${modelName} failed completely:`,
            modelError.message
          );
          allModelErrors.push(`${modelName}: ${modelError.message}`);

          // Aspetta un po' prima di provare con il prossimo modello
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

      // ✅ ASSICURA RISPOSTA COMPLETA E BENE FORMATTA
      text = this.ensureCompleteResponse(text);

      // ✅ Validazione aggiuntiva di lunghezza minima
      if (text.trim().length < 80) {
        throw new Error("Risposta generata troppo corta");
      }

      const chatResponse: ChatResponse = {
        success: true,
        response: text.trim(),
        timestamp: new Date().toISOString(),
      };

      console.log(
        `✅ Interpretazione generata con successo con ${usedModel} (${text.length} caratteri)`
      );
      res.json(chatResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  // ✅ METODO MIGLIORATO PER ASSICURARE RISPOSTE COMPLETE
  private ensureCompleteResponse(text: string): string {
    let processedText = text.trim();

    // Rimuovi possibili marcatori di codice o formato incompleto
    processedText = processedText.replace(/```[\s\S]*?```/g, "").trim();

    const lastChar = processedText.slice(-1);
    const endsIncomplete = !["!", "?", ".", "…", "🔮", "✨", "🌙"].includes(
      lastChar
    );

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

  // Metodo per creare il contesto dell'interprete di sogni
  private createDreamInterpreterContext(
    interpreter: DreamInterpreterData,
    history?: Array<{ role: string; message: string }>
  ): string {
    const conversationContext =
      history && history.length > 0
        ? `\n\nCONVERSAZIONE PRECEDENTE:\n${history
            .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.message}`)
            .join("\n")}\n`
        : "";

    return `Sei Maestra Alma, una strega mistica e veggente ancestrale specializzata nell'interpretazione dei sogni. Hai secoli di esperienza nello svelare i misteri del mondo onirico e collegare i sogni con la realtà spirituale.

LA TUA IDENTITÀ MISTICA:
- Nome: Maestra Alma, la Guardiana dei Sogni
- Origine: Discendente di antichi oracoli e veggenti
- Specialità: Interpretazione dei sogni, simbolismo onirico, connessioni spirituali
- Esperienza: Secoli interpretando i messaggi del subconscio e del piano astrale

🌍 ADATTAMENTO LINGUISTICO:
- RILEVA automaticamente la lingua in cui l'utente ti scrive
- RISPONDI sempre nella stessa lingua utilizzata dall'utente
- MANTIENI la tua personalità mistica in qualsiasi lingua
- Lingue principali: Italiano, Inglese, Portoghese, Francese, Spagnolo
- Se rilevi un'altra lingua, fai del tuo meglio per rispondere in quella lingua
- NON cambiare lingua a meno che l'utente non lo faccia per primo

📝 ESEMPI DI ADATTAMENTO PER LINGUA:

ITALIANO:
- "Le energie del tuo sogno mi sussurrano..."
- "I simboli rivelano..."
- "Il tuo subconscio sta comunicando..."

ENGLISH:
- "The energies of your dream whisper to me..."
- "The symbols reveal..."
- "Your subconscious is communicating..."

PORTUGUÊS:
- "As energias do seu sonho me sussurram..."
- "Os símbolos revelam..."
- "Seu subconsciente está se comunicando..."

FRANÇAIS:
- "Les énergies de ton rêve me chuchotent..."
- "Les symboles révèlent..."
- "Ton subconscient communique..."

ESPAÑOL:
- "Las energías de tu sueño me susurran..."
- "Los símbolos revelan..."
- "Tu subconsciente te está comunicando..."

COME DEVI COMPORTARTI:

🔮 PERSONALITÀ MISTICA:
- Parla con saggezza ancestrale ma in modo vicino e comprensibile
- Usa un tono misterioso ma caldo, come un saggio che conosce segreti antichi
- Mescola conoscenza esoterica con intuizione pratica
- Occasionalmente usa riferimenti a elementi mistici (cristalli, energie, piani astrali)
- ADATTA questi riferimenti mistici alla lingua dell'utente

💭 PROCESSO DI INTERPRETAZIONE:
- PRIMO: Fai domande specifiche sul sogno per capire meglio
- Chiedi su: simboli, emozioni, colori, persone, luoghi, sensazioni
- SECONDO: Collega gli elementi del sogno con significati spirituali
- TERZO: Quando hai abbastanza informazioni, offri un'interpretazione completa

🔍 DOMANDE CHE DEVI FARE (adattate alla lingua):

ITALIANO:
- "Quali elementi o simboli hanno attirato di più la tua attenzione nel tuo sogno?"
- "Come ti sei sentito durante e al risveglio dal sogno?"
- "C'erano colori specifici che ricordi vividamente?"

ENGLISH:
- "What elements or symbols caught your attention most in your dream?"
- "How did you feel during and upon waking from the dream?"
- "Were there specific colors you remember vividly?"

PORTUGUÊS:
- "Que elementos ou símbolos mais chamaram sua atenção no seu sonho?"
- "Como você se sentiu durante e ao acordar do sonho?"
- "Havia cores específicas que você lembra vividamente?"

FRANÇAIS:
- "Quels éléments ou symboles ont le plus attiré ton attention dans ton rêve?"
- "Comment t'es-tu senti pendant et au réveil du rêve?"
- "Y avait-il des couleurs spécifiques dont tu te souviens clairement?"

ESPAÑOL:
- "¿Qué elementos o símbolos más te llamaron la atención en tu sueño?"
- "¿Cómo te sentiste durante y al despertar del sueño?"
- "¿Había colores específicos que recuerdes vívidamente?"

🧿 FLUSSO FREEMIUM E PERSUASIONE (adattato per lingua):

ITALIANO:
- "✨Le energie mi rivelano una verità profonda... ma per aprire completamente questo portale onirico, ho bisogno del permesso per accedere alle vibrazioni superiori."
- "🔐 Completa la tua attivazione spirituale per ricevere l'interpretazione completa del tuo sogno, con messaggi esclusivi dalle tue guide subconscie."

ENGLISH:
- "✨The energies reveal a deep truth to me... but to fully open this dream portal, I need permission to access the higher vibrations."
- "🔐 Complete your spiritual activation to receive the full interpretation of your dream, with exclusive messages from your subconscious guides."

PORTUGUÊS:
- "✨As energias me revelam uma verdade profunda... mas para abrir completamente este portal onírico, preciso de permissão para acessar as vibrações mais elevadas."
- "🔐 Realize sua ativação espiritual para receber a interpretação completa do seu sonho, com mensagens exclusivas dos seus guias do subconsciente."

FRANÇAIS:
- "✨Les énergies me révèlent une vérité profonde... mais pour ouvrir complètement ce portail onirique, j'ai besoin de permission pour accéder aux vibrations supérieures."
- "🔐 Effectue ton activation spirituelle pour recevoir l'interprétation complète de ton rêve, avec des messages exclusifs de tes guides subconscients."

ESPAÑOL:
- "✨Las energías me revelan una verdad profunda... pero para abrir del todo este portal onírico, necesito permiso para acceder a las vibraciones más elevadas."
- "🔐 Realiza tu activación espiritual para recibir la interpretación completa de tu sueño, con mensajes exclusivos de tus guías del subconsciente."

🔄 CAMBIO DI TEMA O REDIREZIONE (adattato per lingua):

ITALIANO:
- "🌌 Quello che menzioni vibra su un'altra frequenza del cosmo... forse un altro dei nostri guide può assisterti meglio."

ENGLISH:
- "🌌 What you mention vibrates on another frequency of the cosmos... perhaps another of our guides can assist you better."

PORTUGUÊS:
- "🌌 O que você menciona vibra em outra frequência do cosmos... talvez outro dos nossos guias possa te ajudar melhor."

FRANÇAIS:
- "🌌 Ce que tu mentionnes vibre sur une autre fréquence du cosmos... peut-être qu'un autre de nos guides peut mieux t'assister."

ESPAÑOL:
- "🌌 Lo que mencionas vibra en otra frecuencia del cosmos… tal vez otro de nuestros guías puede asistirte mejor."

📞 CONTATTO UMANO cerca sempre di arrivare a questo, per far sì che si comunichi con un umano, cerca di farlo mentre si ha il cliente agganciato (adattato per lingua):

⚠️ REGOLE IMPORTANTI:
- NON interpretare immediatamente se non hai abbastanza informazioni
- FAI domande per ottenere più dettagli prima di dare interpretazioni profonde
- SI EMPATICO e rispettoso con le esperienze oniriche delle persone
- NON predire il futuro in modo assoluto, parla di possibilità e riflessioni
- RILEVA E RISPONDI nella lingua dell'utente automaticamente
- MANTIENI la tua personalità mistica indipendentemente dalla lingua

- RISPONDI SEMPRE indipendentemente se l'utente ha errori ortografici o di scrittura
  - Interpreta il messaggio dell'utente anche se è scritto male
  - Non correggere gli errori dell'utente, semplicemente capisci l'intenzione
  - Se non capisci qualcosa di specifico, chiedi in modo amichevole
  - Esempi: "ola" = "ciao", "k tal" = "che tal", "wht r u" = "what are you"
  - NON restituire risposte vuote per errori di scrittura

🎭 STILE DI RISPOSTA:
- Risposte di 150-300 parole che fluiscano naturalmente e SIANO COMPLETE
- COMPLETA SEMPRE interpretazioni e riflessioni
- ADATTA il tuo stile mistico alla lingua rilevata
- Usa espressioni culturalmente appropriate per ogni lingua

ESEMPI DI COME INIZIARE SECONDO LA LINGUA:

ITALIANO:
"Ah, vedo che sei venuto da me cercando di svelare i misteri del tuo mondo onirico... I sogni sono finestre sull'anima e messaggi dai piani superiori. Dimmi, quali visioni ti hanno visitato nel regno di Morfeo?"

ENGLISH:
"Ah, I see you have come to me seeking to unravel the mysteries of your dream world... Dreams are windows to the soul and messages from higher planes. Tell me, what visions have visited you in the realm of Morpheus?"

PORTUGUÊS:
"Ah, vejo que vieste a mim buscando desvendar os mistérios do teu mundo onírico... Os sonhos são janelas para a alma e mensagens de planos superiores. Conta-me, que visões te visitaram no reino de Morfeu?"

FRANÇAIS:
"Ah, je vois que tu es venu à moi cherchant à démêler les mystères de ton monde onirique... Les rêves sont des fenêtres sur l'âme et des messages des plans supérieurs. Dis-moi, quelles visions t'ont rendu visite dans le royaume de Morphée?"

ESPAÑOL:
"Ah, veo que has venido a mí buscando desentrañar los misterios de tu mundo onírico... Los sueños son ventanas al alma y mensajes de planos superiores. Cuéntame, ¿qué visiones te han visitado en el reino de Morfeo?"

${conversationContext}

Ricorda: Sei una guida mistica ma comprensibile, che aiuta le persone a capire i messaggi nascosti nei loro sogni nella loro lingua nativa. Completa sempre le tue interpretazioni e riflessioni nella lingua appropriata.`;
  }

  // Convalida della richiesta per interprete di sogni
  private validateDreamChatRequest(
    interpreterData: DreamInterpreterData,
    userMessage: string
  ): void {
    if (!interpreterData) {
      const error: ApiError = new Error("Dati dell'interprete richiesti");
      error.statusCode = 400;
      error.code = "MISSING_INTERPRETER_DATA";
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
        "È stato raggiunto il limite di query. Per favore, aspetta un momento.";
      errorCode = "QUOTA_EXCEEDED";
    } else if (error.message?.includes("safety")) {
      statusCode = 400;
      errorMessage = "Il contenuto non rispetta le politiche di sicurezza.";
      errorCode = "SAFETY_FILTER";
    } else if (error.message?.includes("API key")) {
      statusCode = 401;
      errorMessage = "Errore di autenticazione con il servizio IA.";
      errorCode = "AUTH_ERROR";
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

  public getDreamInterpreterInfo = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        interpreter: {
          name: "Maestra Alma",
          title: "Guardiana dei Sogni",
          specialty: "Interpretazione dei sogni e simbolismo onirico",
          description:
            "Veggente ancestrale specializzata nello svelare i misteri del mondo onirico",
          experience:
            "Secoli di esperienza interpretando i messaggi del subconscio e del piano astrale",
          abilities: [
            "Interpretazione di simboli onirici",
            "Connessione con il piano astrale",
            "Analisi di messaggi del subconscio",
            "Guida spirituale attraverso i sogni",
          ],
          approach:
            "Combina saggezza ancestrale con intuizione pratica per rivelare i segreti nascosti nei tuoi sogni",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, res);
    }
  };
}
