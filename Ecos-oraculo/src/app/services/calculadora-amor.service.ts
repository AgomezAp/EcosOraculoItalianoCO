import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, catchError, map, Observable, throwError } from 'rxjs';
import { environment } from '../environments/environmets.prod';

export interface LoveExpert {
  name: string;
  title: string;
  specialty: string;
  description: string;
  services: string[];
}

export interface LoveExpertInfo {
  success: boolean;
  loveExpert: LoveExpert;
  timestamp: string;
}

export interface LoveCalculatorData {
  name: string;
  specialty: string;
  experience: string;
}

export interface LoveCalculatorRequest {
  loveCalculatorData: LoveCalculatorData;
  userMessage: string;
  person1Name?: string;
  person1BirthDate?: string;
  person2Name?: string;
  person2BirthDate?: string;
  conversationHistory?: ConversationMessage[];
}

export interface ConversationMessage {
  role: 'user' | 'love_expert';
  message: string;
  timestamp: Date;
  id?: string;
}

export interface LoveCalculatorResponse {
  success: boolean;
  response?: string;
  error?: string;
  code?: string;
  timestamp?: string;
  freeMessagesRemaining?: number; // ✅ NUOVO
  showPaywall?: boolean; // ✅ NUOVO
  paywallMessage?: string; // ✅ NUOVO
  isCompleteResponse?: boolean; // ✅ NUOVO
}

export interface CompatibilityData {
  person1Name: string;
  person1BirthDate: string;
  person2Name: string;
  person2BirthDate: string;
}

@Injectable({
  providedIn: 'root',
})
export class CalculadoraAmorService {
  private readonly apiUrl = `${environment.apiUrl}`;
  private conversationHistorySubject = new BehaviorSubject<
    ConversationMessage[]
  >([]);
  private compatibilityDataSubject =
    new BehaviorSubject<CompatibilityData | null>(null);

  public conversationHistory$ = this.conversationHistorySubject.asObservable();
  public compatibilityData$ = this.compatibilityDataSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Ottiene informazioni sull'esperto dell'amore
   */
  getLoveExpertInfo(): Observable<LoveExpertInfo> {
    return this.http
      .get<LoveExpertInfo>(`${this.apiUrl}info`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Invia un messaggio all'esperto dell'amore
   */
  chatWithLoveExpert(
    userMessage: string,
    person1Name?: string,
    person1BirthDate?: string,
    person2Name?: string,
    person2BirthDate?: string,
    conversationHistory?: Array<{
      role: 'user' | 'love_expert';
      message: string;
    }>,
    messageCount?: number, // ✅ NUOVO
    isPremiumUser?: boolean // ✅ NUOVO
  ): Observable<LoveCalculatorResponse> {
    const currentHistory = this.conversationHistorySubject.value;

    const requestData: LoveCalculatorRequest = {
      loveCalculatorData: {
        name: 'Maestra Valentina',
        specialty: 'Compatibilità numerologica e analisi delle relazioni',
        experience:
          "Decenni di analisi della compatibilità attraverso i numeri dell'amore",
      },
      userMessage,
      person1Name,
      person1BirthDate,
      person2Name,
      person2BirthDate,
      conversationHistory: currentHistory,
    };

    return this.http
      .post<LoveCalculatorResponse>(`${this.apiUrl}chat`, requestData)
      .pipe(
        map((response: any) => {
          if (response.success && response.response) {
            // Aggiungere messaggi alla conversazione
            this.addMessageToHistory('user', userMessage);
            this.addMessageToHistory('love_expert', response.response);
          }
          return response;
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Calcola la compatibilità tra due persone
   */
  calculateCompatibility(
    compatibilityData: CompatibilityData
  ): Observable<LoveCalculatorResponse> {
    // Salvare i dati di compatibilità
    this.setCompatibilityData(compatibilityData);

    const message = `Voglio conoscere la compatibilità tra ${compatibilityData.person1Name} e ${compatibilityData.person2Name}. Per favore, analizza la nostra compatibilità numerologica.`;

    return this.chatWithLoveExpert(
      message,
      compatibilityData.person1Name,
      compatibilityData.person1BirthDate,
      compatibilityData.person2Name,
      compatibilityData.person2BirthDate
    );
  }

  /**
   * Ottiene consigli sulla relazione
   */
  getRelationshipAdvice(question: string): Observable<LoveCalculatorResponse> {
    const compatibilityData = this.compatibilityDataSubject.value;

    return this.chatWithLoveExpert(
      question,
      compatibilityData?.person1Name,
      compatibilityData?.person1BirthDate,
      compatibilityData?.person2Name,
      compatibilityData?.person2BirthDate
    );
  }

  /**
   * Aggiunge un messaggio alla cronologia della conversazione
   */
  private addMessageToHistory(
    role: 'user' | 'love_expert',
    message: string
  ): void {
    const currentHistory = this.conversationHistorySubject.value;
    const newMessage: ConversationMessage = {
      role,
      message,
      timestamp: new Date(),
    };

    const updatedHistory = [...currentHistory, newMessage];
    this.conversationHistorySubject.next(updatedHistory);
  }

  /**
   * Imposta i dati di compatibilità
   */
  setCompatibilityData(data: CompatibilityData): void {
    this.compatibilityDataSubject.next(data);
  }

  /**
   * Ottiene i dati di compatibilità attuali
   */
  getCompatibilityData(): CompatibilityData | null {
    return this.compatibilityDataSubject.value;
  }

  /**
   * Cancella la cronologia della conversazione
   */
  clearConversationHistory(): void {
    this.conversationHistorySubject.next([]);
  }

  /**
   * Cancella i dati di compatibilità
   */
  clearCompatibilityData(): void {
    this.compatibilityDataSubject.next(null);
  }

  /**
   * Resetta tutto il servizio
   */
  resetService(): void {
    this.clearConversationHistory();
    this.clearCompatibilityData();
  }

  /**
   * Ottiene la cronologia attuale della conversazione
   */
  getCurrentHistory(): ConversationMessage[] {
    return this.conversationHistorySubject.value;
  }

  /**
   * Verifica se ci sono dati di compatibilità completi
   */
  hasCompleteCompatibilityData(): boolean {
    const data = this.compatibilityDataSubject.value;
    return !!(
      data?.person1Name &&
      data?.person1BirthDate &&
      data?.person2Name &&
      data?.person2BirthDate
    );
  }

  /**
   * Formatta una data per il backend
   */
  formatDateForBackend(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Valida i dati di compatibilità
   */
  validateCompatibilityData(data: Partial<CompatibilityData>): string[] {
    const errors: string[] = [];

    if (!data.person1Name?.trim()) {
      errors.push('Il nome della prima persona è obbligatorio');
    }

    if (!data.person1BirthDate?.trim()) {
      errors.push('La data di nascita della prima persona è obbligatoria');
    }

    if (!data.person2Name?.trim()) {
      errors.push('Il nome della seconda persona è obbligatorio');
    }

    if (!data.person2BirthDate?.trim()) {
      errors.push('La data di nascita della seconda persona è obbligatoria');
    }

    // Validare formato delle date
    if (data.person1BirthDate && !this.isValidDate(data.person1BirthDate)) {
      errors.push('La data di nascita della prima persona non è valida');
    }

    if (data.person2BirthDate && !this.isValidDate(data.person2BirthDate)) {
      errors.push('La data di nascita della seconda persona non è valida');
    }

    return errors;
  }

  /**
   * Verifica se una data è valida
   */
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * Gestisce errori HTTP
   */
  private handleError = (error: HttpErrorResponse): Observable<never> => {
    console.error('Errore in CalculadoraAmorService:', error);

    let errorMessage = 'Errore sconosciuto';
    let errorCode = 'UNKNOWN_ERROR';

    if (error.error?.error) {
      errorMessage = error.error.error;
      errorCode = error.error.code || 'API_ERROR';
    } else if (error.status === 0) {
      errorMessage =
        'Impossibile connettersi al server. Verifica la tua connessione internet.';
      errorCode = 'CONNECTION_ERROR';
    } else if (error.status >= 400 && error.status < 500) {
      errorMessage =
        'Errore nella richiesta. Per favore, verifica i dati inviati.';
      errorCode = 'CLIENT_ERROR';
    } else if (error.status >= 500) {
      errorMessage = 'Errore del server. Per favore, riprova più tardi.';
      errorCode = 'SERVER_ERROR';
    }

    return throwError(() => ({
      message: errorMessage,
      code: errorCode,
      status: error.status,
    }));
  };
}
