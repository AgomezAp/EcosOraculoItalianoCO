import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { environment } from '../environments/environmets.prod';

// ✅ Interfacce aggiornate per il backend
export interface AstrologerData {
  name: string;
  title: string;
  specialty: string;
  experience: string;
}

export interface ZodiacRequest {
  zodiacData: AstrologerData;
  userMessage: string;
  birthDate?: string;
  zodiacSign?: string;
  conversationHistory?: Array<{
    role: 'user' | 'astrologer';
    message: string;
  }>;
  messageCount?: number;
  isPremiumUser?: boolean;
}

export interface ZodiacResponse {
  success: boolean;
  response?: string;
  error?: string;
  code?: string;
  timestamp: string;
  freeMessagesRemaining?: number;
  showPaywall?: boolean;
  paywallMessage?: string;
  isCompleteResponse?: boolean;
}

export interface AstrologerInfoResponse {
  success: boolean;
  astrologer: {
    name: string;
    title: string;
    specialty: string;
    description: string;
    services: string[];
  };
  freeMessagesLimit: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class InformacionZodiacoService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Invia un messaggio all'astrologo e riceve una risposta
   */
  chatWithAstrologer(request: ZodiacRequest): Observable<ZodiacResponse> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    return this.http
      .post<ZodiacResponse>(`${this.apiUrl}api/zodiaco/chat`, request, {
        headers,
      })
      .pipe(
        timeout(60000), // 60 secondi di timeout
        catchError((error) => {
          console.error('Errore in chatWithAstrologer:', error);

          let errorMessage =
            "Errore nella comunicazione con l'astrologo. Per favore, riprova.";
          let errorCode = 'NETWORK_ERROR';

          if (error.status === 429) {
            errorMessage =
              'Troppe richieste. Per favore, attendi un momento prima di continuare.';
            errorCode = 'RATE_LIMIT';
          } else if (error.status === 503) {
            errorMessage =
              'Il servizio è temporaneamente non disponibile. Riprova tra qualche minuto.';
            errorCode = 'SERVICE_UNAVAILABLE';
          } else if (error.status === 400) {
            errorMessage =
              error.error?.error ||
              'Richiesta non valida. Verifica il tuo messaggio.';
            errorCode = error.error?.code || 'BAD_REQUEST';
          } else if (error.status === 401) {
            errorMessage = 'Errore di autenticazione con il servizio.';
            errorCode = 'AUTH_ERROR';
          } else if (error.name === 'TimeoutError') {
            errorMessage =
              'La richiesta ha impiegato troppo tempo. Per favore, riprova.';
            errorCode = 'TIMEOUT';
          }

          return throwError(() => ({
            success: false,
            error: errorMessage,
            code: errorCode,
            timestamp: new Date().toISOString(),
          }));
        })
      );
  }

  /**
   * Ottiene informazioni sull'astrologo
   */
  getAstrologerInfo(): Observable<AstrologerInfoResponse> {
    return this.http
      .get<AstrologerInfoResponse>(`${this.apiUrl}api/zodiac/info`)
      .pipe(
        timeout(10000),
        catchError((error) => {
          console.error('Errore in getAstrologerInfo:', error);
          return throwError(() => ({
            success: false,
            error: "Errore nel recupero delle informazioni dell'astrologo",
            timestamp: new Date().toISOString(),
          }));
        })
      );
  }

  /**
   * Calcola il segno zodiacale in base alla data di nascita
   */
  calculateZodiacSign(birthDate: string): string {
    try {
      const date = new Date(birthDate);
      const month = date.getMonth() + 1;
      const day = date.getDate();

      if ((month === 3 && day >= 21) || (month === 4 && day <= 19))
        return 'Ariete ♈';
      if ((month === 4 && day >= 20) || (month === 5 && day <= 20))
        return 'Toro ♉';
      if ((month === 5 && day >= 21) || (month === 6 && day <= 20))
        return 'Gemelli ♊';
      if ((month === 6 && day >= 21) || (month === 7 && day <= 22))
        return 'Cancro ♋';
      if ((month === 7 && day >= 23) || (month === 8 && day <= 22))
        return 'Leone ♌';
      if ((month === 8 && day >= 23) || (month === 9 && day <= 22))
        return 'Vergine ♍';
      if ((month === 9 && day >= 23) || (month === 10 && day <= 22))
        return 'Bilancia ♎';
      if ((month === 10 && day >= 23) || (month === 11 && day <= 21))
        return 'Scorpione ♏';
      if ((month === 11 && day >= 22) || (month === 12 && day <= 21))
        return 'Sagittario ♐';
      if ((month === 12 && day >= 22) || (month === 1 && day <= 19))
        return 'Capricorno ♑';
      if ((month === 1 && day >= 20) || (month === 2 && day <= 18))
        return 'Acquario ♒';
      if ((month === 2 && day >= 19) || (month === 3 && day <= 20))
        return 'Pesci ♓';

      return 'Segno sconosciuto';
    } catch {
      return 'Data non valida';
    }
  }
}
