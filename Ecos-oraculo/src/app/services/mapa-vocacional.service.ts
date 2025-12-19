import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, timeout } from 'rxjs';
import { environment } from '../environments/environmets.prod';

// ✅ Interfaccia per i dati del consulente vocazionale
interface VocationalData {
  name: string;
  title?: string;
  specialty: string;
  experience: string;
}

// ✅ Interfaccia del Request - ESPORTATA
export interface VocationalRequest {
  vocationalData: VocationalData;
  userMessage: string;
  personalInfo?: any;
  assessmentAnswers?: any[];
  conversationHistory?: Array<{
    role: 'user' | 'counselor';
    message: string;
  }>;
  // ✅ NUOVI CAMPI per il sistema di 3 messaggi gratuiti
  messageCount?: number;
  isPremiumUser?: boolean;
}

// ✅ Interfaccia del Response - ESPORTATA
export interface VocationalResponse {
  success: boolean;
  response?: string;
  error?: string;
  code?: string;
  timestamp?: string;
  // ✅ NUOVI CAMPI restituiti dal backend
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

// ✅ Interfaccia per informazioni del consulente - ESPORTATA
export interface CounselorInfo {
  success: boolean;
  counselor: {
    name: string;
    title: string;
    specialty: string;
    description: string;
    services: string[];
  };
  freeMessagesLimit?: number;
  timestamp: string;
}

interface AssessmentQuestion {
  id: number;
  question: string;
  options: Array<{
    value: string;
    label: string;
    category: string;
  }>;
}

interface AssessmentAnswer {
  question: string;
  answer: string;
  category: string;
}

interface VocationalProfile {
  name: string;
  description: string;
  characteristics: string[];
  workEnvironments: string[];
}

@Injectable({
  providedIn: 'root',
})
export class MapaVocacionalService {
  private appUrl: string;
  private apiUrl: string;

  // Dati predefiniti del consulente vocazionale
  private defaultVocationalData: VocationalData = {
    name: 'Dott.ssa Valeria',
    title: 'Specialista in Orientamento Professionale',
    specialty: 'Orientamento professionale e percorsi di carriera personalizzati',
    experience:
      'Anni di esperienza in orientamento vocazionale e sviluppo di carriera',
  };

  // Profili vocazionali
  private vocationalProfiles: { [key: string]: VocationalProfile } = {
    realistic: {
      name: 'Realista',
      description:
        'Preferisce attività pratiche e lavorare con strumenti, macchine o animali.',
      characteristics: ['Pratico', 'Meccanico', 'Atletico', 'Diretto'],
      workEnvironments: [
        'All\'aperto',
        'Officine',
        'Laboratori',
        'Edilizia',
      ],
    },
    investigative: {
      name: 'Investigativo',
      description:
        'Ama risolvere problemi complessi e condurre ricerche.',
      characteristics: ['Analitico', 'Curioso', 'Indipendente', 'Riservato'],
      workEnvironments: [
        'Laboratori',
        'Università',
        'Centri di ricerca',
      ],
    },
    artistic: {
      name: 'Artistico',
      description:
        'Valorizza l\'autoespressione, la creatività e il lavoro non strutturato.',
      characteristics: ['Creativo', 'Originale', 'Indipendente', 'Espressivo'],
      workEnvironments: ['Studi', 'Teatri', 'Agenzie creative', 'Musei'],
    },
    social: {
      name: 'Sociale',
      description: 'Preferisce lavorare con le persone, aiutare e insegnare.',
      characteristics: ['Cooperativo', 'Empatico', 'Paziente', 'Generoso'],
      workEnvironments: [
        'Scuole',
        'Ospedali',
        'ONG',
        'Servizi sociali',
      ],
    },
    enterprising: {
      name: 'Intraprendente',
      description:
        'Ama guidare, persuadere e prendere decisioni aziendali.',
      characteristics: ['Ambizioso', 'Energico', 'Dominante', 'Ottimista'],
      workEnvironments: ['Aziende', 'Vendite', 'Politica', 'Startup'],
    },
    conventional: {
      name: 'Convenzionale',
      description:
        'Preferisce attività ordinate, seguendo procedure stabilite.',
      characteristics: ['Organizzato', 'Preciso', 'Efficiente', 'Pratico'],
      workEnvironments: [
        'Uffici',
        'Banche',
        'Contabilità',
        'Amministrazione',
      ],
    },
  };

  constructor(private http: HttpClient) {
    this.appUrl = environment.apiUrl;
    this.apiUrl = 'api/vocational';
  }

  /**
   * ✅ METODO PRINCIPALE: Inviare messaggio con contatore di messaggi
   */
  sendMessageWithCount(
    userMessage: string,
    messageCount: number,
    isPremiumUser: boolean,
    personalInfo?: any,
    assessmentAnswers?: any[],
    conversationHistory?: Array<{ role: 'user' | 'counselor'; message: string }>
  ): Observable<VocationalResponse> {
    const request: VocationalRequest = {
      vocationalData: this.defaultVocationalData,
      userMessage: userMessage.trim(),
      personalInfo,
      assessmentAnswers,
      conversationHistory,
      messageCount,
      isPremiumUser,
    };

    console.log('📤 Invio messaggio vocazionale:', {
      messageCount: request.messageCount,
      isPremiumUser: request.isPremiumUser,
      userMessage: request.userMessage.substring(0, 50) + '...',
    });

    return this.http
      .post<VocationalResponse>(`${this.appUrl}${this.apiUrl}/counselor`, request)
      .pipe(
        timeout(60000),
        map((response: VocationalResponse) => {
          console.log('📥 Risposta vocazionale:', {
            success: response.success,
            freeMessagesRemaining: response.freeMessagesRemaining,
            showPaywall: response.showPaywall,
            isCompleteResponse: response.isCompleteResponse,
          });

          if (response.success) {
            return response;
          }
          throw new Error(response.error || 'Risposta non valida dal server');
        }),
        catchError((error: HttpErrorResponse) => {
          console.error('Errore nella comunicazione vocazionale:', error);
          return of({
            success: false,
            error: this.getErrorMessage(error),
            timestamp: new Date().toISOString(),
          } as VocationalResponse);
        })
      );
  }

  /**
   * Metodo legacy per compatibilità
   */
  sendMessage(
    userMessage: string,
    personalInfo?: any,
    assessmentAnswers?: any[],
    conversationHistory?: Array<{ role: 'user' | 'counselor'; message: string }>
  ): Observable<string> {
    const request: VocationalRequest = {
      vocationalData: this.defaultVocationalData,
      userMessage: userMessage.trim(),
      personalInfo,
      assessmentAnswers,
      conversationHistory,
      messageCount: 1,
      isPremiumUser: false,
    };

    return this.http
      .post<VocationalResponse>(`${this.appUrl}${this.apiUrl}/counselor`, request)
      .pipe(
        timeout(30000),
        map((response: VocationalResponse) => {
          if (response.success && response.response) {
            return response.response;
          }
          throw new Error(response.error || 'Risposta non valida dal server');
        }),
        catchError((error: HttpErrorResponse) => {
          console.error('Errore nella comunicazione vocazionale:', error);
          return of(this.getErrorMessage(error));
        })
      );
  }

  /**
   * Ottenere domande dell'assessment
   */
  getAssessmentQuestions(): Observable<AssessmentQuestion[]> {
    return of(this.getDefaultQuestions());
  }

  /**
   * Analizzare risposte dell'assessment
   */
  analyzeAssessment(answers: AssessmentAnswer[]): Observable<any> {
    const categoryCount: { [key: string]: number } = {};

    answers.forEach((answer) => {
      if (answer.category) {
        categoryCount[answer.category] =
          (categoryCount[answer.category] || 0) + 1;
      }
    });

    const total = answers.length;
    const distribution = Object.entries(categoryCount)
      .map(([category, count]) => ({
        category,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const dominantCategory = distribution[0]?.category || 'social';
    const dominantProfile =
      this.vocationalProfiles[dominantCategory] ||
      this.vocationalProfiles['social'];

    return of({
      profileDistribution: distribution,
      dominantProfile,
      recommendations: this.getRecommendations(dominantCategory),
    });
  }

  /**
   * Ottenere emoji della categoria
   */
  getCategoryEmoji(category: string): string {
    const emojis: { [key: string]: string } = {
      realistic: '🔧',
      investigative: '🔬',
      artistic: '🎨',
      social: '🤝',
      enterprising: '💼',
      conventional: '📊',
    };
    return emojis[category] || '⭐';
  }

  /**
   * Ottenere colore della categoria
   */
  getCategoryColor(category: string): string {
    const colors: { [key: string]: string } = {
      realistic: '#4CAF50',
      investigative: '#2196F3',
      artistic: '#9C27B0',
      social: '#FF9800',
      enterprising: '#F44336',
      conventional: '#607D8B',
    };
    return colors[category] || '#757575';
  }

  /**
   * Ottenere domande predefinite
   */
  private getDefaultQuestions(): AssessmentQuestion[] {
    return [
      {
        id: 1,
        question:
          'Che tipo di attività preferisci svolgere nel tempo libero?',
        options: [
          {
            value: 'a',
            label: 'Costruire o riparare cose',
            category: 'realistic',
          },
          {
            value: 'b',
            label: 'Leggere e ricercare nuovi argomenti',
            category: 'investigative',
          },
          { value: 'c', label: 'Creare arte o musica', category: 'artistic' },
          { value: 'd', label: 'Aiutare altre persone', category: 'social' },
          {
            value: 'e',
            label: 'Organizzare eventi o guidare gruppi',
            category: 'enterprising',
          },
          {
            value: 'f',
            label: 'Organizzare e classificare informazioni',
            category: 'conventional',
          },
        ],
      },
      {
        id: 2,
        question:
          'In che tipo di ambiente di lavoro ti sentiresti più a tuo agio?',
        options: [
          {
            value: 'a',
            label: 'All\'aperto o in un\'officina',
            category: 'realistic',
          },
          {
            value: 'b',
            label: 'In un laboratorio o centro di ricerca',
            category: 'investigative',
          },
          { value: 'c', label: 'In uno studio creativo', category: 'artistic' },
          {
            value: 'd',
            label: 'In una scuola o ospedale',
            category: 'social',
          },
          {
            value: 'e',
            label: 'In un\'azienda o startup',
            category: 'enterprising',
          },
          {
            value: 'f',
            label: 'In un ufficio ben organizzato',
            category: 'conventional',
          },
        ],
      },
      {
        id: 3,
        question: 'Quale di queste abilità ti descrive meglio?',
        options: [
          {
            value: 'a',
            label: 'Abilità manuale e tecnica',
            category: 'realistic',
          },
          {
            value: 'b',
            label: 'Pensiero analitico',
            category: 'investigative',
          },
          {
            value: 'c',
            label: 'Creatività e immaginazione',
            category: 'artistic',
          },
          { value: 'd', label: 'Empatia e comunicazione', category: 'social' },
          {
            value: 'e',
            label: 'Leadership e persuasione',
            category: 'enterprising',
          },
          {
            value: 'f',
            label: 'Organizzazione e precisione',
            category: 'conventional',
          },
        ],
      },
      {
        id: 4,
        question: 'Che tipo di problema preferiresti risolvere?',
        options: [
          {
            value: 'a',
            label: 'Riparare una macchina guasta',
            category: 'realistic',
          },
          {
            value: 'b',
            label: 'Scoprire perché qualcosa funziona in un certo modo',
            category: 'investigative',
          },
          {
            value: 'c',
            label: 'Progettare qualcosa di nuovo e originale',
            category: 'artistic',
          },
          {
            value: 'd',
            label: 'Aiutare qualcuno con un problema personale',
            category: 'social',
          },
          {
            value: 'e',
            label: 'Trovare un\'opportunità di business',
            category: 'enterprising',
          },
          {
            value: 'f',
            label: 'Ottimizzare un processo esistente',
            category: 'conventional',
          },
        ],
      },
      {
        id: 5,
        question: 'Quale materia ti piaceva di più a scuola?',
        options: [
          {
            value: 'a',
            label: 'Educazione fisica o tecnologia',
            category: 'realistic',
          },
          {
            value: 'b',
            label: 'Scienze o matematica',
            category: 'investigative',
          },
          { value: 'c', label: 'Arte o musica', category: 'artistic' },
          {
            value: 'd',
            label: 'Scienze sociali o lingue',
            category: 'social',
          },
          { value: 'e', label: 'Economia o dibattito', category: 'enterprising' },
          {
            value: 'f',
            label: 'Informatica o contabilità',
            category: 'conventional',
          },
        ],
      },
    ];
  }

  /**
   * Ottenere raccomandazioni secondo la categoria
   */
  private getRecommendations(category: string): string[] {
    const recommendations: { [key: string]: string[] } = {
      realistic: [
        'Ingegneria meccanica o civile',
        'Tecnico di manutenzione',
        'Falegnameria o elettricista',
        'Agricoltura o veterinaria',
      ],
      investigative: [
        'Scienze naturali o medicina',
        'Ricerca scientifica',
        'Analisi dei dati',
        'Programmazione e sviluppo software',
      ],
      artistic: [
        'Design grafico o industriale',
        'Belle arti o musica',
        'Architettura',
        'Produzione audiovisiva',
      ],
      social: [
        'Psicologia o servizio sociale',
        'Educazione o pedagogia',
        'Infermieristica o medicina',
        'Risorse umane',
      ],
      enterprising: [
        'Amministrazione aziendale',
        'Marketing e vendite',
        'Giurisprudenza',
        'Imprenditoria',
      ],
      conventional: [
        'Contabilità e finanza',
        'Pubblica amministrazione',
        'Segreteria esecutiva',
        'Logistica e operazioni',
      ],
    };
    return recommendations[category] || recommendations['social'];
  }

  /**
   * Gestione degli errori HTTP
   */
  private getErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 429) {
      return 'Hai effettuato troppe richieste. Per favore, attendi un momento prima di continuare.';
    }

    if (error.status === 503) {
      return 'Il servizio è temporaneamente non disponibile. Riprova tra qualche minuto.';
    }

    if (error.status === 0) {
      return 'Impossibile connettersi con il consulente vocazionale. Riprova tra qualche minuto.';
    }

    return 'Scusa, sto riscontrando difficoltà tecniche. Per favore, riprova più tardi.';
  }
}