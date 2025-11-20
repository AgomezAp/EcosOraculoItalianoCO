import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { CookieService } from 'ngx-cookie-service';
import { environment } from '../../environments/environmets.prod';
import { HttpClient } from '@angular/common/http';
import { AnalyticsService } from '../../services/analytics.service';
import { SugerenciasService } from '../../services/sugerencias.service';
import { LoggerService } from '../../services/logger.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-bienvenida',
  imports: [MatIconModule, CommonModule, FormsModule],
  templateUrl: './bienvenida.component.html',
  styleUrl: './bienvenida.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BienvenidaComponent implements AfterViewInit, OnInit {
  @ViewChild('backgroundVideo') backgroundVideo!: ElementRef<HTMLVideoElement>;
  showCookieBanner = false;
  isReturningUser = false;
  userZodiacSign: string | null = null;
  visitCount = 0;
  sessionStartTime: Date = new Date();
  private apiUrl = environment.apiUrl; // Assicurati di avere questo nel tuo environment
  sugerenciaTexto: string = '';
  enviandoSugerencia: boolean = false;
  mensajeSugerencia: { texto: string; tipo: 'success' | 'error' } | null = null;
  constructor(
    private router: Router,
    private cookieService: CookieService,
    private http: HttpClient,
    private analyticsService: AnalyticsService,
    private sugerenciasService: SugerenciasService,
    private elRef: ElementRef<HTMLElement>,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef
    ) {}

  ngAfterViewInit() {
    this.startVideo();
    const serviceCards = document.querySelectorAll('.service-card');

    serviceCards.forEach((card) => {
      const video = card.querySelector('.card-video') as HTMLVideoElement;

      if (video) {
        video.load();

        card.addEventListener('mouseenter', async () => {
          try {
            await video.play();
          } catch (error) {
            this.logger.log('Autoplay bloccato, tentando alternativa');
            video.muted = true;
            video.play();
          }
        });

        card.addEventListener('mouseleave', () => {
          video.pause();
          video.currentTime = 0;
        });
      }
    });
      this.setVideosSpeed(0.7);
  }
   private setVideosSpeed(rate: number): void {
    const host = this.elRef.nativeElement;
    const videos = host.querySelectorAll<HTMLVideoElement>('video');
    videos.forEach((v) => {
      const apply = () => (v.playbackRate = rate);
      if (v.readyState >= 1) apply();
      else v.addEventListener('loadedmetadata', apply, { once: true });
    });
  }

  ngOnInit() {
    this.sessionStartTime = new Date();
    this.initializeCookies();
  }
  ngOnDestroy() {
    // Inviare analytics alla chiusura della sessione
    if (this.cookieService.get('cookieConsent') === 'accepted') {
      this.sendAnalytics();
    }
  }
  async sendAnalytics() {
    try {
      await this.analyticsService.collectAndSendUserAnalytics(
        this.sessionStartTime
      );
    } catch (error) {
      this.logger.error('Errore nell\'invio degli analytics:', error);
    }
  }
  calculateSessionDuration(): number {
    const now = new Date();
    return Math.round((now.getTime() - this.sessionStartTime.getTime()) / 1000); // in secondi
  }

  // ✅ Ottenere informazioni sul dispositivo
  getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenResolution: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      cookiesEnabled: navigator.cookieEnabled,
    };
  }
  getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';

    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';

    return {
      name: browser,
      version: this.getBrowserVersion(ua),
      mobile: /Mobi|Android/i.test(ua),
    };
  }
  private getBrowserVersion(ua: string): string {
    const match = ua.match(/(Chrome|Firefox|Safari|Edge)\/(\d+)/);
    return match ? match[2] : 'Unknown';
  }
  generateAnonymousId(): string {
    let userId = this.cookieService.get('anonymousUserId');

    if (!userId) {
      userId =
        'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      this.cookieService.set('anonymousUserId', userId, 365);
    }

    return userId;
  }
  trackServicePopularity(serviceName: string) {
    this.analyticsService.trackServicePopularity(serviceName);
  }
  private trackServiceVisit(service: string) {
    this.analyticsService.trackServiceVisit(service);
  }
  // ✅ Aggiornare navigateTo per includere il tracking

  private startVideo() {
    if (this.backgroundVideo && this.backgroundVideo.nativeElement) {
      const video = this.backgroundVideo.nativeElement;

      // Assicurare che sia silenziato
      video.muted = true;
      video.volume = 0;
      video.playbackRate = 1;
      // Tentare di riprodurre
      const playPromise = video.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            this.logger.log('Video riprodotto automaticamente');
          })
          .catch((error) => {
            this.logger.log(
              'Autoplay fallito, tentando con interazione dell\'utente:',
              error
            );
            this.setupUserInteractionFallback();
          });
      }
    }
  }

  private setupUserInteractionFallback() {
    const playOnInteraction = () => {
      if (this.backgroundVideo && this.backgroundVideo.nativeElement) {
        this.backgroundVideo.nativeElement.play();
        document.removeEventListener('click', playOnInteraction);
        document.removeEventListener('touchstart', playOnInteraction);
      }
    };

    document.addEventListener('click', playOnInteraction);
    document.addEventListener('touchstart', playOnInteraction);
  }
  initializeCookies() {
    this.logger.info('Avviando sistema dei cookie');

    try {
      const consent = this.cookieService.get('cookieConsent');
      this.showCookieBanner = !consent || consent === '';
      this.logger.log('Mostrare banner?', this.showCookieBanner);

      if (consent === 'accepted') {
        this.loadUserData();
        this.personalizeExperience();
        this.trackVisit();
      }
    } catch (error) {
      this.logger.error('Errore in initializeCookies:', error);
    }
  }

  forceCreateAppCookies() {
    this.cookieService.set('cookieConsent', 'accepted', 365);
    this.cookieService.set('visitCount', '1', 30);
    this.cookieService.set('lastVisit', new Date().toISOString(), 30);
    this.cookieService.set('userZodiacSign', 'Leo', 365);
  }
  loadUserData() {
    this.userZodiacSign = this.cookieService.get('userZodiacSign') || null;
    this.visitCount = parseInt(this.cookieService.get('visitCount') || '0');
    this.isReturningUser = this.visitCount > 1;
  }

  // ✅ Personalizzare esperienza
  personalizeExperience() {
    if (this.isReturningUser) {
      this.showWelcomeBackMessage();
    }

    if (this.userZodiacSign) {
      this.highlightZodiacContent();
    }
  }

  // ✅ Tracciare visita
  trackVisit() {
    this.visitCount++;
    this.cookieService.set('visitCount', this.visitCount.toString(), 30);
    this.cookieService.set('lastVisit', new Date().toISOString(), 30);
  }

  // ✅ Accettare cookie
  acceptCookies() {
    this.cookieService.set('cookieConsent', 'accepted', 365);
    this.showCookieBanner = false;

    this.initializeCookies();
    this.enableAnalytics();
    this.sendAnalytics(); // 👈 Usa il metodo rifattorizzato

    this.logger.info('Cookie accettati - Analytics avviato');
  }

  // ✅ Rifiutare cookie
  rejectCookies() {
    this.cookieService.set('cookieConsent', 'rejected', 365);
    this.showCookieBanner = false;
    this.logger.log('Cookie rifiutati');
  }

  navigateTo(route: string): void {
    if (this.cookieService.get('cookieConsent') === 'accepted') {
      this.trackServiceVisit(route);
      this.trackServicePopularity(route);
      this.sendPageViewAnalytics(route);
    }
    this.router.navigate([route]);
  }

 

  async sendPageViewAnalytics(route: string) {
    try {
      await this.analyticsService.sendPageViewAnalytics(
        route,
        this.sessionStartTime
      );
    } catch (error) {
      this.logger.error('Errore nell\'invio degli analytics di pagina:', error);
    }
  }
  

  
  async sendPendingAnalytics() {
    try {
      await this.analyticsService.sendPendingAnalytics();
    } catch (error) {
      this.logger.error('Errore nell\'invio degli analytics in sospeso:', error);
    }
  }

  // ✅ Funzioni ausiliarie
  private showWelcomeBackMessage() {
    // Mostrare messaggio di benvenuto personalizzato
    this.logger.log(
      `¡Bentornato! Questa è la tua visita numero ${this.visitCount}`
    );
  }
  
  private highlightZodiacContent() {
    // Evidenziare contenuto relativo al segno zodiacale
    this.logger.log(`Personalizzando per segno: ${this.userZodiacSign}`);
  }

  private enableAnalytics() {
    // Abilitare Google Analytics o altri strumenti
    this.logger.info('Analytics abilitato');
  }
    async enviarSugerencia() {
    // Convalidare input
    if (!this.sugerenciaTexto || this.sugerenciaTexto.trim().length === 0) {
      this.mostrarMensajeSugerencia('Per favore, scrivi un suggerimento', 'error');
      return;
    }

    if (this.sugerenciaTexto.length > 1000) {
      this.mostrarMensajeSugerencia('Il suggerimento non può superare 1000 caratteri', 'error');
      return;
    }

    // Inviare suggerimento
    this.enviandoSugerencia = true;
    this.cdr.markForCheck();
    
    try {
      const response = await this.sugerenciasService.enviarSugerencia(this.sugerenciaTexto).toPromise();
      
      if (response?.success) {
        this.mostrarMensajeSugerencia('✅ ¡Suggerimento inviato con successo!', 'success');
        this.sugerenciaTexto = ''; // Pulire input
      } else {
        this.mostrarMensajeSugerencia('Errore nell\'invio del suggerimento', 'error');
      }
      
    } catch (error) {
      this.logger.error('Errore nell\'invio del suggerimento:', error);
      this.mostrarMensajeSugerencia(
        typeof error === 'string' ? error : 'Errore di connessione. Riprova.',
        'error'
      );
    } finally {
      this.enviandoSugerencia = false;
      this.cdr.markForCheck();
    }
  }
    // Mostrare messaggio di conferma
  private mostrarMensajeSugerencia(texto: string, tipo: 'success' | 'error') {
    this.mensajeSugerencia = { texto, tipo };
    this.cdr.markForCheck();
    
    // Nascondere messaggio dopo 4 secondi
    setTimeout(() => {
      this.mensajeSugerencia = null;
      this.cdr.markForCheck();
    }, 4000);
  }

  // Tracciare suggerimento inviato

  // Gestire Enter nell'input
  onSugerenciaKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !this.enviandoSugerencia) {
      this.enviarSugerencia();
    }
  }
}