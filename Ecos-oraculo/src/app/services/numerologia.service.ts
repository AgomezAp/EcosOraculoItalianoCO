import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, timeout } from 'rxjs';
import { environment } from '../environments/environmets.prod';

// ✅ Interfaccia per i dati del numerologo
interface NumerologyData {
  name: string;
  title?: string;
  specialty: string;
  experience: string;
}

// ✅ Interfaccia del Request - ESPORTATA
export interface NumerologyRequest {
  numerologyData: NumerologyData;
  userMessage: string;
  birthDate?: string;
  fullName?: string;
  conversationHistory?: Array<{
    role: 'user' | 'numerologist';
    message: string;
  }>;
  messageCount?: number;
  isPremiumUser?: boolean;
}

// ✅ Interfaccia del Response - ESPORTATA
export interface NumerologyResponse {
  success: boolean;
  response?: string;
  error?: string;
  code?: string;
  timestamp?: string;
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

// ✅ Interfaccia per informazioni del numerologo - ESPORTATA
export interface NumerologyInfo {
  success: boolean;
  numerologist: {
    name: string;
    title: string;
    specialty: string;
    description: string;
    services: string[];
  };
  freeMessagesLimit?: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class NumerologiaService {
  private appUrl: string;
  private apiUrl: string;

  // Dati predefiniti del numerologo
  private defaultNumerologyData: NumerologyData = {
    name: 'Maestra Sofia',
    title: 'Guardiana dei Numeri Sacri',
    specialty: 'Numerologia pitagorica',
    experience:
      "Decenni di esperienza nelle vibrazioni numeriche dell'universo",
  };

  constructor(private http: HttpClient) {
    this.appUrl = environment.apiUrl;
    this.apiUrl = 'api/numerology';
  }

  /**
   * ✅ METODO PRINCIPALE: Inviare messaggio con contatore di messaggi
   */
  sendMessageWithCount(
    userMessage: string,
    messageCount: number,
    isPremiumUser: boolean,
    birthDate?: string,
    fullName?: string,
    conversationHistory?: Array<{
      role: 'user' | 'numerologist';
      message: string;
    }>
  ): Observable<NumerologyResponse> {
    const request: NumerologyRequest = {
      numerologyData: this.defaultNumerologyData,
      userMessage: userMessage.trim(),
      birthDate,
      fullName,
      conversationHistory,
      messageCount,
      isPremiumUser,
    };

    console.log('📤 Invio messaggio al numerologo:', {
      messageCount: request.messageCount,
      isPremiumUser: request.isPremiumUser,
      userMessage: request.userMessage.substring(0, 50) + '...',
    });

    return this.http
      .post<NumerologyResponse>(
        `${this.appUrl}${this.apiUrl}/numerologist`,
        request
      )
      .pipe(
        timeout(60000),
        map((response: NumerologyResponse) => {
          console.log('📥 Risposta del numerologo:', {
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
          console.error('Errore nella comunicazione con il numerologo:', error);
          return of({
            success: false,
            error: this.getErrorMessage(error),
            timestamp: new Date().toISOString(),
          } as NumerologyResponse);
        })
      );
  }

  /**
   * Metodo legacy per compatibilità
   */
  sendMessage(
    userMessage: string,
    birthDate?: string,
    fullName?: string,
    conversationHistory?: Array<{
      role: 'user' | 'numerologist';
      message: string;
    }>
  ): Observable<string> {
    const request: NumerologyRequest = {
      numerologyData: this.defaultNumerologyData,
      userMessage: userMessage.trim(),
      birthDate,
      fullName,
      conversationHistory,
      messageCount: 1,
      isPremiumUser: false,
    };

    console.log(
      'Invio messaggio al numerologo (legacy):',
      this.apiUrl + '/numerologist'
    );

    return this.http
      .post<NumerologyResponse>(
        `${this.appUrl}${this.apiUrl}/numerologist`,
        request
      )
      .pipe(
        timeout(30000),
        map((response: NumerologyResponse) => {
          console.log('Risposta del numerologo:', response);
          if (response.success && response.response) {
            return response.response;
          }
          throw new Error(response.error || 'Risposta non valida dal server');
        }),
        catchError((error: HttpErrorResponse) => {
          console.error('Errore nella comunicazione con il numerologo:', error);
          return of(this.getErrorMessage(error));
        })
      );
  }

  /**
   * Ottenere informazioni del numerologo
   */
  getNumerologyInfo(): Observable<NumerologyInfo> {
    return this.http
      .get<NumerologyInfo>(`${this.appUrl}${this.apiUrl}/numerologist/info`)
      .pipe(
        timeout(10000),
        catchError((error: HttpErrorResponse) => {
          console.error(
            'Errore nel recupero delle info del numerologo:',
            error
          );
          return of({
            success: false,
            numerologist: {
              name: 'Maestra Sofia',
              title: 'Guardiana dei Numeri Sacri',
              specialty: 'Numerologia pitagorica',
              description: 'Errore nella connessione con il numerologo',
              services: [],
            },
            freeMessagesLimit: 3,
            timestamp: new Date().toISOString(),
          } as NumerologyInfo);
        })
      );
  }

  /**
   * Testare connessione con il backend
   */
  testConnection(): Observable<any> {
    return this.http.get(`${this.appUrl}api/health`).pipe(
      timeout(5000),
      catchError((error: HttpErrorResponse) => {
        console.error('Errore di connessione:', error);
        return of({
          success: false,
          error: 'Impossibile connettersi con il servizio di numerologia',
        });
      })
    );
  }

  /**
   * Calcolare numero del percorso di vita
   */
  calculateLifePath(birthDate: string): number {
    try {
      const numbers = birthDate.replace(/\D/g, '');
      const sum = numbers
        .split('')
        .reduce((acc, digit) => acc + parseInt(digit), 0);
      return this.reduceToSingleDigit(sum);
    } catch {
      return 0;
    }
  }

  /**
   * Calcolare numero del destino basato sul nome
   */
  calculateDestinyNumber(name: string): number {
    const letterValues: { [key: string]: number } = {
      A: 1,
      B: 2,
      C: 3,
      D: 4,
      E: 5,
      F: 6,
      G: 7,
      H: 8,
      I: 9,
      J: 1,
      K: 2,
      L: 3,
      M: 4,
      N: 5,
      O: 6,
      P: 7,
      Q: 8,
      R: 9,
      S: 1,
      T: 2,
      U: 3,
      V: 4,
      W: 5,
      X: 6,
      Y: 7,
      Z: 8,
    };

    const sum = name
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .split('')
      .reduce((acc, letter) => {
        return acc + (letterValues[letter] || 0);
      }, 0);

    return this.reduceToSingleDigit(sum);
  }

  /**
   * Ottenere interpretazione base di un numero
   */
  getNumberMeaning(number: number): string {
    const meanings: { [key: number]: string } = {
      1: 'Leadership, indipendenza, pioniere',
      2: 'Cooperazione, diplomazia, sensibilità',
      3: 'Creatività, comunicazione, espressione',
      4: 'Stabilità, duro lavoro, organizzazione',
      5: 'Libertà, avventura, cambiamento',
      6: 'Responsabilità, cura, armonia',
      7: 'Spiritualità, introspezione, analisi',
      8: 'Potere materiale, ambizione, successo',
      9: 'Umanitarismo, compassione, saggezza',
      11: 'Ispirazione, intuizione, illuminazione (Numero Maestro)',
      22: 'Costruttore maestro, visione pratica (Numero Maestro)',
      33: "Maestro guaritore, servizio all'umanità (Numero Maestro)",
    };

    return meanings[number] || 'Numero non riconosciuto';
  }

  /**
   * Metodo ausiliario per ridurre a cifra singola
   */
  private reduceToSingleDigit(num: number): number {
    while (num > 9 && num !== 11 && num !== 22 && num !== 33) {
      num = num
        .toString()
        .split('')
        .reduce((acc, digit) => acc + parseInt(digit), 0);
    }
    return num;
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
      return 'Impossibile connettersi con la maestra di numerologia. Riprova tra qualche minuto.';
    }

    if (error.error?.code === 'RATE_LIMIT_EXCEEDED') {
      return 'Troppe richieste. Per favore, attendi un momento.';
    }

    if (error.error?.code === 'MISSING_NUMEROLOGY_DATA') {
      return 'Errore nei dati del numerologo. Per favore, riprova.';
    }

    if (error.error?.code === 'ALL_MODELS_UNAVAILABLE') {
      return 'Tutti i modelli di IA sono temporaneamente non disponibili. Riprova tra qualche minuto.';
    }

    return 'Scusa, le energie numerologiche sono bloccate in questo momento. Ti invito a meditare e a riprovare più tardi.';
  }
}
