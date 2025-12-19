import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, timeout } from 'rxjs';
import { environment } from '../environments/environments';

export interface DreamInterpreterData {
  name: string;
  title?: string;
  specialty: string;
  experience: string;
}

export interface ConversationMessage {
  role: 'user' | 'interpreter';
  message: string;
  timestamp: Date | string;
  id?: string;
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  isCompleteResponse?: boolean;
  isPrizeAnnouncement?: boolean;
}

export interface DreamChatRequest {
  interpreterData: DreamInterpreterData;
  userMessage: string;
  conversationHistory?: ConversationMessage[];
  // ✅ NUOVI CAMPI per il sistema di 3 messaggi gratuiti
  messageCount?: number;
  isPremiumUser?: boolean;
}

export interface DreamChatResponse {
  success: boolean;
  response?: string;
  error?: string;
  code?: string;
  timestamp: string;
  // ✅ NUOVI CAMPI restituiti dal backend
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

export interface InterpreterInfo {
  success: boolean;
  interpreter: {
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
export class InterpretadorSuenosService {
  private apiUrl = `${environment.apiUrl}`;

  // Dati predefiniti dell'interprete
  private defaultInterpreterData: DreamInterpreterData = {
    name: 'Maestra Alma',
    title: 'Guardiana dei Sogni',
    specialty: 'Interpretazione dei sogni e simbolismo onirico',
    experience:
      "Secoli di esperienza nell'interpretare messaggi del subconscio",
  };

  constructor(private http: HttpClient) {}

  /**
   * ✅ METODO PRINCIPALE: Inviare messaggio con contatore di messaggi
   */
  chatWithInterpreterWithCount(
    userMessage: string,
    messageCount: number,
    isPremiumUser: boolean,
    conversationHistory?: ConversationMessage[]
  ): Observable<DreamChatResponse> {
    const request: DreamChatRequest = {
      interpreterData: this.defaultInterpreterData,
      userMessage: userMessage.trim(),
      conversationHistory,
      messageCount,
      isPremiumUser,
    };

    console.log('📤 Invio messaggio sui sogni:', {
      messageCount: request.messageCount,
      isPremiumUser: request.isPremiumUser,
      userMessage: request.userMessage.substring(0, 50) + '...',
    });

    return this.http
      .post<DreamChatResponse>(`${this.apiUrl}interpretador-sueno`, request)
      .pipe(
        timeout(60000),
        map((response: DreamChatResponse) => {
          console.log('📥 Risposta sui sogni:', {
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
          console.error("Errore nella comunicazione con l'interprete:", error);
          return of({
            success: false,
            error: this.getErrorMessage(error),
            timestamp: new Date().toISOString(),
          } as DreamChatResponse);
        })
      );
  }

  /**
   * Metodo legacy per compatibilità
   */
  chatWithInterpreter(
    request: DreamChatRequest
  ): Observable<DreamChatResponse> {
    const fullRequest: DreamChatRequest = {
      ...request,
      interpreterData: request.interpreterData || this.defaultInterpreterData,
      messageCount: request.messageCount || 1,
      isPremiumUser: request.isPremiumUser || false,
    };

    return this.http
      .post<DreamChatResponse>(`${this.apiUrl}interpretador-sueno`, fullRequest)
      .pipe(
        timeout(30000),
        catchError((error: HttpErrorResponse) => {
          console.error('Errore in chatWithInterpreter:', error);
          return of({
            success: false,
            error: this.getErrorMessage(error),
            timestamp: new Date().toISOString(),
          } as DreamChatResponse);
        })
      );
  }

  /**
   * Ottenere informazioni sull'interprete
   */
  getInterpreterInfo(): Observable<InterpreterInfo> {
    return this.http
      .get<InterpreterInfo>(`${this.apiUrl}interpretador-sueno/info`)
      .pipe(
        timeout(10000),
        catchError((error: HttpErrorResponse) => {
          console.error(
            "Errore nel recupero delle info dell'interprete:",
            error
          );
          return of({
            success: false,
            interpreter: {
              name: 'Maestra Alma',
              title: 'Guardiana dei Sogni',
              specialty: 'Interpretazione dei sogni e simbolismo onirico',
              description: "Errore nella connessione con l'interprete",
              services: [],
            },
            freeMessagesLimit: 3,
            timestamp: new Date().toISOString(),
          } as InterpreterInfo);
        })
      );
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
      return "Impossibile connettersi con l'interprete dei sogni. Riprova tra qualche minuto.";
    }

    if (error.error?.code === 'RATE_LIMIT_EXCEEDED') {
      return 'Troppe richieste. Per favore, attendi un momento.';
    }

    if (error.error?.code === 'ALL_MODELS_UNAVAILABLE') {
      return 'Tutti i modelli di IA sono temporaneamente non disponibili. Riprova tra qualche minuto.';
    }

    return 'Scusa, le energie oniriche sono disturbate in questo momento. Riprova più tardi.';
  }
}
