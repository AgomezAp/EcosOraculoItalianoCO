import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  OnInit,
  Optional,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  BirthChartRequest,
  BirthChartResponse,
  TablaNacimientoService,
} from '../../services/tabla-nacimiento.service';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PaypalService } from '../../services/paypal.service';

import { HttpClient } from '@angular/common/http';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RecolectaDatosComponent } from '../recolecta-datos/recolecta-datos.component';
import { environment } from '../../environments/environmets.prod';
import { Observable, map, catchError, of } from 'rxjs';
import {
  FortuneWheelComponent,
  Prize,
} from '../fortune-wheel/fortune-wheel.component';
interface BirthChartMessage {
  content: string;
  isUser: boolean;
  timestamp: Date;
  sender: string;
}

interface Message {
  sender: string;
  content: string;
  timestamp: Date;
  isUser: boolean;
  id?: string;
}
interface ChartData {
  sunSign?: string;
  moonSign?: string;
  ascendant?: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
  fullName?: string;
}

interface AstrologerInfo {
  name: string;
  title: string;
  specialty: string;
}
@Component({
  selector: 'app-tabla-nacimiento',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    RecolectaDatosComponent,
    FortuneWheelComponent,
  ],
  templateUrl: './tabla-nacimiento.component.html',
  styleUrl: './tabla-nacimiento.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TablaNacimientoComponent
  implements OnInit, AfterViewChecked, OnDestroy, AfterViewInit
{
  @ViewChild('chatContainer') chatContainer!: ElementRef;

  // Chat y mensajes
  messages: Message[] = [];
  currentMessage: string = '';
  isLoading: boolean = false;

  // Control de scroll
  private shouldScrollToBottom: boolean = true;
  private isUserScrolling: boolean = false;
  private lastMessageCount: number = 0;

  // Datos personales y carta
  chartData: ChartData = {};
  fullName: string = '';
  birthDate: string = '';
  birthTime: string = '';
  birthPlace: string = '';
  showDataForm: boolean = false;

  // Información del astrólogo
  astrologerInfo: AstrologerInfo = {
    name: 'Maestra Emma',
    title: 'Guardiana delle Configurazioni Celesti',
    specialty: 'Specialista di Temi Natali e Astrologia Transpersonale',
  };

  //Datos para enviar
  showDataModal: boolean = false;
  userData: any = null;
  //Variables para la ruleta
  showFortuneWheel: boolean = false;
  birthChartPrizes: Prize[] = [
    {
      id: '1',
      name: '3 Giri della Ruota Natale',
      color: '#4ecdc4',
      icon: '🌟',
    },
    {
      id: '2',
      name: '1 Analisi Premium del Tema Natale',
      color: '#45b7d1',
      icon: '✨',
    },
    {
      id: '4',
      name: 'Riprova ancora!',
      color: '#ff7675',
      icon: '🔮',
    },
  ];

  private wheelTimer: any;
  // Sistema de pagos
  showPaymentModal: boolean = false;

  clientSecret: string | null = null;
  isProcessingPayment: boolean = false;
  paymentError: string | null = null;
  hasUserPaidForBirthTable: boolean = false;
  firstQuestionAsked: boolean = false;
  blockedMessageId: string | null = null;

  private backendUrl = environment.apiUrl;

  constructor(
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
    @Optional() public dialogRef: MatDialogRef<TablaNacimientoComponent>,
    private http: HttpClient,
    private tablaNacimientoService: TablaNacimientoService,
    private elRef: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
    private paypalService: PaypalService // ← AGREGAR ESTA LÍNEA
  ) {}
  ngAfterViewInit(): void {
    this.setVideosSpeed(0.6); // 0.5 = más lento, 1 = normal
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
  async ngOnInit(): Promise<void> {
    this.hasUserPaidForBirthTable =
      sessionStorage.getItem('hasUserPaidForBirthTable_geburtstabelle') ===
      'true';

    const paymentStatus = this.paypalService.checkPaymentStatusFromUrl();

    if (paymentStatus && paymentStatus.status === 'COMPLETED') {
      try {
        const verification = await this.paypalService.verifyAndProcessPayment(
          paymentStatus.token
        );

        if (verification.valid && verification.status === 'approved') {
          this.hasUserPaidForBirthTable = true;
          sessionStorage.setItem(
            'hasUserPaidForBirthTable_geburtstabelle',
            'true'
          );
          localStorage.removeItem('paypal_payment_completed');

          this.blockedMessageId = null;
          sessionStorage.removeItem('vocationalBlockedMessageId');

          // Clear URL
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );

          this.messages.push({
            sender: 'Maestra Emma',
            content:
              '✨ Pagamento confermato! Ora puoi accedere a tutta la mia esperienza.',
            timestamp: new Date(),
            isUser: false,
          });

          this.saveMessagesToSession();

          this.cdr.markForCheck();
        }
      } catch (error) {
        console.error('Error verificando pago de PayPal:', error);

        this.paymentError = 'Errore nella verifica del pagamento';
      }
    }

    // ✅ NUEVO: Cargar datos del usuario desde sessionStorage
    const savedUserData = sessionStorage.getItem('userData');
    if (savedUserData) {
      try {
        this.userData = JSON.parse(savedUserData);
      } catch (error) {
        this.userData = null;
      }
    } else {
      this.userData = null;
    }

    // Cargar datos guardados
    this.loadSavedData();

    // Mensaje de bienvenida
    if (this.messages.length === 0) {
      this.initializeBirthChartWelcomeMessage();
    }

    // ✅ TAMBIÉN VERIFICAR PARA MENSAJES RESTAURADOS
    if (this.messages.length > 0 && FortuneWheelComponent.canShowWheel()) {
      this.showBirthChartWheelAfterDelay(2000);
    }
  }
  private initializeBirthChartWelcomeMessage(): void {
    this.addMessage({
      sender: 'Maestra Emma',
      content: `🌟 Ciao, Cercatore dei Segreti Celesti! Sono Emma, la tua guida nel cosmo delle configurazioni astrali.

Sono qui per decifrare i segreti nascosti nel tuo tema natale. Le stelle hanno atteso questo momento per rivelarti la loro saggezza.

Quale aspetto del tuo tema natale vuoi esplorare per primo?`,
      timestamp: new Date(),
      isUser: false,
    });

    // ✅ VERIFICACIÓN DE RULETA NATAL
    if (FortuneWheelComponent.canShowWheel()) {
      this.showBirthChartWheelAfterDelay(3000);
    } else {
    }
  }
  ngAfterViewChecked(): void {
    if (
      this.shouldScrollToBottom &&
      !this.isUserScrolling &&
      this.messages.length > this.lastMessageCount
    ) {
      this.scrollToBottom();
      this.lastMessageCount = this.messages.length;
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
    }
  }

  private loadSavedData(): void {
    const savedMessages = sessionStorage.getItem('birthChartMessages');
    const savedFirstQuestion = sessionStorage.getItem(
      'birthChartFirstQuestionAsked'
    );
    const savedBlockedMessageId = sessionStorage.getItem(
      'birthChartBlockedMessageId'
    );
    const savedChartData = sessionStorage.getItem('birthChartData');

    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);
        this.messages = parsedMessages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        this.firstQuestionAsked = savedFirstQuestion === 'true';
        this.blockedMessageId = savedBlockedMessageId || null;
        this.lastMessageCount = this.messages.length;
      } catch (error) {
        // Limpiar datos corruptos
        this.initializeBirthChartWelcomeMessage();
      }
    }

    if (savedChartData) {
      try {
        this.chartData = JSON.parse(savedChartData);
        this.fullName = this.chartData.fullName || '';
        this.birthDate = this.chartData.birthDate || '';
        this.birthTime = this.chartData.birthTime || '';
        this.birthPlace = this.chartData.birthPlace || '';
      } catch (error) {}
    }
  }

  sendMessage(): void {
    if (this.currentMessage?.trim() && !this.isLoading) {
      const userMessage = this.currentMessage.trim();

      // ✅ NUEVA LÓGICA: Verificar consultas natales gratuitas ANTES de verificar pago
      if (!this.hasUserPaidForBirthTable && this.firstQuestionAsked) {
        // Verificar si tiene consultas natales gratis disponibles
        if (this.hasFreeBirthChartConsultationsAvailable()) {
          this.useFreeBirthChartConsultation();
          // Continuar con el mensaje sin bloquear
        } else {
          // Si no tiene consultas gratis, mostrar modal de datos

          // Cerrar otros modales primero
          this.showFortuneWheel = false;
          this.showPaymentModal = false;

          // Guardar el mensaje para procesarlo después del pago
          sessionStorage.setItem('pendingBirthChartMessage', userMessage);

          this.saveStateBeforePayment();

          // Mostrar modal de datos con timeout
          setTimeout(() => {
            this.showDataModal = true;
            this.cdr.markForCheck();
          }, 100);

          return; // Salir aquí para no procesar el mensaje aún
        }
      }

      this.shouldScrollToBottom = true;

      // Procesar mensaje normalmente
      this.processBirthChartUserMessage(userMessage);
    }
  }
  private processBirthChartUserMessage(userMessage: string): void {
    // Agregar mensaje del usuario
    const userMsg = {
      sender: 'Du',
      content: userMessage,
      timestamp: new Date(),
      isUser: true,
    };
    this.messages.push(userMsg);

    this.saveMessagesToSession();
    this.currentMessage = '';
    this.isLoading = true;

    // Usar el servicio real de carta natal
    this.generateAstrologicalResponse(userMessage).subscribe({
      next: (response: any) => {
        this.isLoading = false;

        const messageId = Date.now().toString();
        const astrologerMsg = {
          sender: 'Meisterin Emma',
          content: response,
          timestamp: new Date(),
          isUser: false,
          id: messageId,
        };
        this.messages.push(astrologerMsg);

        this.shouldScrollToBottom = true;

        // ✅ LÓGICA MODIFICADA: Solo bloquear si no tiene consultas gratis Y no ha pagado
        if (
          this.firstQuestionAsked &&
          !this.hasUserPaidForBirthTable &&
          !this.hasFreeBirthChartConsultationsAvailable()
        ) {
          this.blockedMessageId = messageId;
          sessionStorage.setItem('birthChartBlockedMessageId', messageId);

          setTimeout(() => {
            this.saveStateBeforePayment();

            // Cerrar otros modales
            this.showFortuneWheel = false;
            this.showPaymentModal = false;

            // Mostrar modal de datos
            setTimeout(() => {
              this.showDataModal = true;
              this.cdr.markForCheck();
            }, 100);
          }, 2000);
        } else if (!this.firstQuestionAsked) {
          this.firstQuestionAsked = true;
          sessionStorage.setItem('birthChartFirstQuestionAsked', 'true');
        }

        this.saveMessagesToSession();
        this.cdr.markForCheck();
      },
      error: (error: any) => {
        this.isLoading = false;

        const errorMsg = {
          sender: 'Maestra Emma',
          content:
            '🌟 Mi scuso, le configurazioni celesti sono temporaneamente disturbate. Per favore riprova tra qualche istante.',
          timestamp: new Date(),
          isUser: false,
        };

        this.messages.push(errorMsg);
        this.saveMessagesToSession();
        this.cdr.markForCheck();
      },
    });
  }
  private generateAstrologicalResponse(
    userMessage: string
  ): Observable<string> {
    // Crear el historial de conversación para el contexto
    const conversationHistory = this.messages
      .filter((msg) => msg.content && msg.content.trim() !== '')
      .map((msg) => ({
        role: msg.isUser ? ('user' as const) : ('astrologer' as const),
        message: msg.content,
      }));

    // Crear la solicitud con la estructura correcta
    const request: BirthChartRequest = {
      chartData: {
        name: this.astrologerInfo.name,
        specialty: this.astrologerInfo.specialty,
        experience:
          "Secoli di esperienza nell'interpretazione delle configurazioni celesti e dei segreti dei temi natali",
      },
      userMessage,
      birthDate: this.birthDate,
      birthTime: this.birthTime,
      birthPlace: this.birthPlace,
      fullName: this.fullName,
      conversationHistory,
    };

    // Llamar al servicio y transformar la respuesta
    return this.tablaNacimientoService.chatWithAstrologer(request).pipe(
      map((response: BirthChartResponse) => {
        if (response.success && response.response) {
          return response.response;
        } else {
          throw new Error(response.error || 'Unbekannter Dienstfehler');
        }
      }),

      catchError((error: any) => {
        return of(
          '🌟 Le configurazioni celesti sono temporaneamente coperte. Le stelle mi sussurrano che devo ricaricare le mie energie cosmiche. Per favore riprova tra qualche istante.'
        );
      })
    );
  }

  private saveStateBeforePayment(): void {
    this.saveMessagesToSession();
    this.saveChartData();
    sessionStorage.setItem(
      'birthChartFirstQuestionAsked',
      this.firstQuestionAsked.toString()
    );
    if (this.blockedMessageId) {
      sessionStorage.setItem(
        'birthChartBlockedMessageId',
        this.blockedMessageId
      );
    }
  }

  private saveMessagesToSession(): void {
    try {
      const messagesToSave = this.messages.map((msg) => ({
        ...msg,
        timestamp:
          msg.timestamp instanceof Date
            ? msg.timestamp.toISOString()
            : msg.timestamp,
      }));
      sessionStorage.setItem(
        'birthChartMessages',
        JSON.stringify(messagesToSave)
      );
    } catch {}
  }

  private saveChartData(): void {
    try {
      const dataToSave = {
        ...this.chartData,
        fullName: this.fullName,
        birthDate: this.birthDate,
        birthTime: this.birthTime,
        birthPlace: this.birthPlace,
      };
      sessionStorage.setItem('birthChartData', JSON.stringify(dataToSave));
    } catch {}
  }

  isMessageBlocked(message: Message): boolean {
    return (
      message.id === this.blockedMessageId && !this.hasUserPaidForBirthTable
    );
  }

  async promptForPayment(): Promise<void> {
    this.showPaymentModal = true;
    this.cdr.markForCheck();
    this.paymentError = null;
    this.isProcessingPayment = false;

    // Validar datos de usuario
    if (!this.userData) {
      const savedUserData = sessionStorage.getItem('userData');
      if (savedUserData) {
        try {
          this.userData = JSON.parse(savedUserData);
        } catch (error) {
          this.userData = null;
        }
      }
    }

    if (!this.userData) {
      this.paymentError =
        'Dati del cliente non trovati. Per favore compila prima il modulo.';
      this.showDataModal = true;
      this.cdr.markForCheck();
      return;
    }

    const email = this.userData.email?.toString().trim();
    if (!email) {
      this.paymentError = 'Email richiesta. Per favore compila il modulo.';
      this.showDataModal = true;
      this.cdr.markForCheck();
      return;
    }
    // Guardar mensaje pendiente si existe
    if (this.currentMessage) {
      sessionStorage.setItem('pendingBirthTableMessage', this.currentMessage);
    }
  }

  async handlePaymentSubmit(): Promise<void> {
    this.isProcessingPayment = true;
    this.paymentError = null;
    this.cdr.markForCheck();

    try {
      await this.paypalService.initiatePayment({
        amount: '5.00',
        currency: 'EUR',
        serviceName: 'Tabella di nascita',
        returnPath: '/tabella-nascita',
        cancelPath: '/tabella-nascita',
      });
    } catch (error: any) {
      this.paymentError =
        error.message ||
        "Errore durante l'inizializzazione del pagamento PayPal.";
      this.isProcessingPayment = false;
      this.cdr.markForCheck();
    }
  }

  cancelPayment(): void {
    this.showPaymentModal = false;
    this.isProcessingPayment = false;
    this.paymentError = null;
    this.cdr.markForCheck();
  }

  // Métodos de manejo de datos personales
  savePersonalData(): void {
    this.chartData = {
      ...this.chartData,
      fullName: this.fullName,
      birthDate: this.birthDate,
      birthTime: this.birthTime,
      birthPlace: this.birthPlace,
    };

    // Generar signos de ejemplo basados en los datos
    if (this.birthDate) {
      this.generateSampleChartData();
    }

    this.saveChartData();
    this.showDataForm = false;

    this.shouldScrollToBottom = true;
    this.addMessage({
      sender: 'Maestra Emma',
      content: `🌟 Perfetto, ${this.fullName}. Ho registrato i tuoi dati celesti. Le configurazioni della tua nascita a ${this.birthPlace} il ${this.birthDate} rivelano modelli unici nel cosmo. Su cosa vuoi concentrarti specificamente nel tuo tema natale?`,
      timestamp: new Date(),
      isUser: false,
    });
  }

  private generateSampleChartData(): void {
    // Generar datos de ejemplo basados en la fecha de nacimiento
    const date = new Date(this.birthDate);
    const month = date.getMonth() + 1;

    const zodiacSigns = [
      'Capricorno',
      'Acquario',
      'Pesci',
      'Ariete',
      'Toro',
      'Gemelli',
      'Cancro',
      'Leone',
      'Vergine',
      'Bilancia',
      'Scorpione',
      'Sagittario',
    ];

    const signIndex = Math.floor((month - 1) / 1) % 12;
    this.chartData.sunSign = zodiacSigns[signIndex];
    this.chartData.moonSign = zodiacSigns[(signIndex + 4) % 12];
    this.chartData.ascendant = zodiacSigns[(signIndex + 8) % 12];
  }

  toggleDataForm(): void {
    this.showDataForm = !this.showDataForm;
  }

  // Métodos de utilidad
  addMessage(message: Message): void {
    this.messages.push(message);
    this.shouldScrollToBottom = true;
  }

  formatMessage(content: string): string {
    if (!content) return '';

    let formattedContent = content;

    // Convertir **texto** a <strong>texto</strong> para negrilla
    formattedContent = formattedContent.replace(
      /\*\*(.*?)\*\*/g,
      '<strong>$1</strong>'
    );

    // Convertir saltos de línea a <br> para mejor visualización
    formattedContent = formattedContent.replace(/\n/g, '<br>');

    // Opcional: También puedes manejar *texto* (una sola asterisco) como cursiva
    formattedContent = formattedContent.replace(
      /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
      '<em>$1</em>'
    );

    return formattedContent;
  }

  onScroll(event: any): void {
    const element = event.target;
    const isAtBottom =
      element.scrollHeight - element.scrollTop === element.clientHeight;
    this.isUserScrolling = !isAtBottom;
    if (isAtBottom) this.isUserScrolling = false;
  }

  onUserStartScroll(): void {
    this.isUserScrolling = true;
    setTimeout(() => {
      if (this.chatContainer) {
        const element = this.chatContainer.nativeElement;
        const isAtBottom =
          element.scrollHeight - element.scrollTop === element.clientHeight;
        if (isAtBottom) this.isUserScrolling = false;
      }
    }, 3000);
  }

  private scrollToBottom(): void {
    try {
      if (this.chatContainer) {
        const element = this.chatContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    } catch {}
  }
  autoResize(event: any): void {
    const textarea = event.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  getTimeString(timestamp: Date | string): string {
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  }
  closeModal(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }
  clearChat(): void {
    // Limpiar mensajes del chat
    this.messages = [];
    this.currentMessage = '';
    this.lastMessageCount = 0;

    // Resetear estados
    this.firstQuestionAsked = false;
    this.blockedMessageId = null;
    this.isLoading = false;

    // Limpiar sessionStorage de tabla de nacimiento (pero NO userData)
    sessionStorage.removeItem('birthChartMessages');
    sessionStorage.removeItem('birthChartFirstQuestionAsked');
    sessionStorage.removeItem('birthChartBlockedMessageId');
    sessionStorage.removeItem('birthChartData');

    // Indicar que se debe hacer scroll porque hay un mensaje nuevo
    this.shouldScrollToBottom = true;

    // Usar el método separado para inicializar
    this.initializeBirthChartWelcomeMessage();
  }
  onUserDataSubmitted(userData: any): void {
    // ✅ VALIDAR CAMPOS CRÍTICOS ANTES DE PROCEDER
    const requiredFields = ['email']; // ❌ QUITADO 'apellido'
    const missingFields = requiredFields.filter(
      (field) => !userData[field] || userData[field].toString().trim() === ''
    );

    if (missingFields.length > 0) {
      alert(
        `Per procedere, devi compilare quanto segue: ${missingFields.join(
          ', '
        )}`
      );
      this.showDataModal = true; // Mantener modal abierto
      this.cdr.markForCheck();
      return;
    }

    // ✅ LIMPIAR Y GUARDAR datos INMEDIATAMENTE en memoria Y sessionStorage
    this.userData = {
      ...userData,
      email: userData.email?.toString().trim(),
    };

    // ✅ GUARDAR EN sessionStorage INMEDIATAMENTE
    try {
      sessionStorage.setItem('userData', JSON.stringify(this.userData));

      // Verificar que se guardaron correctamente
      const verificacion = sessionStorage.getItem('userData');
    } catch (error) {}

    this.showDataModal = false;
    this.cdr.markForCheck();

    // ✅ NUEVO: Enviar datos al backend como en otros componentes
    this.sendUserDataToBackend(userData);
  }
  private sendUserDataToBackend(userData: any): void {
    this.http.post(`${this.backendUrl}api/recolecta`, userData).subscribe({
      next: (response) => {
        // ✅ LLAMAR A promptForPayment QUE INICIALIZA STRIPE
        this.promptForPayment();
      },
      error: (error) => {
        // ✅ AUN ASÍ ABRIR EL MODAL DE PAGO
        this.promptForPayment();
      },
    });
  }
  onDataModalClosed(): void {
    this.showDataModal = false;
    this.cdr.markForCheck();
  }
  showBirthChartWheelAfterDelay(delayMs: number = 3000): void {
    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
    }

    this.wheelTimer = setTimeout(() => {
      if (
        FortuneWheelComponent.canShowWheel() &&
        !this.showPaymentModal &&
        !this.showDataModal
      ) {
        this.showFortuneWheel = true;
        this.cdr.markForCheck();
      } else {
      }
    }, delayMs);
  }

  onPrizeWon(prize: Prize): void {
    const prizeMessage: Message = {
      sender: 'Maestra Emma',
      content: `🌟 Le configurazioni celesti hanno cospitato a tuo favore! Hai vinto: **${prize.name}** ${prize.icon}\n\nI guardiani antichi delle stelle hanno deciso di benedirti con questo dono sacro. L\'energia cosmica scorre attraverso di te, rivelando segreti più profondi del tuo tema natale. Che la saggezza celeste ti illumini!`,
      timestamp: new Date(),
      isUser: false,
    };

    this.messages.push(prizeMessage);
    this.shouldScrollToBottom = true;
    this.saveMessagesToSession();

    this.processBirthChartPrize(prize);
  }

  onWheelClosed(): void {
    this.showFortuneWheel = false;
  }

  triggerBirthChartWheel(): void {
    if (this.showPaymentModal || this.showDataModal) {
      return;
    }

    if (FortuneWheelComponent.canShowWheel()) {
      this.showFortuneWheel = true;
      this.cdr.markForCheck();
    } else {
      alert(
        'Non hai più giri disponibili. ' + FortuneWheelComponent.getSpinStatus()
      );
    }
  }

  getSpinStatus(): string {
    return FortuneWheelComponent.getSpinStatus();
  }
  private processBirthChartPrize(prize: Prize): void {
    switch (prize.id) {
      case '1': // 3 Lecturas Astrales
        this.addFreeBirthChartConsultations(3);
        break;
      case '2': // 1 Análisis Premium - ACCESO COMPLETO
        this.hasUserPaidForBirthTable = true;
        sessionStorage.setItem('hasUserPaidBirthChart', 'true');

        // Desbloquear cualquier mensaje bloqueado
        if (this.blockedMessageId) {
          this.blockedMessageId = null;
          sessionStorage.removeItem('birthChartBlockedMessageId');
        }

        // Agregar mensaje especial para este premio
        const premiumMessage: Message = {
          sender: 'Maestra Emma',
          content:
            "🌟 **Hai sbloccato l'accesso Premium completo!** 🌟\n\nLe configurazioni celesti ti hanno sorriso in modo straordinario. Ora hai accesso illimitato a tutta la mia saggezza sui temi natali. Puoi consultarmi tutte le volte che desideri sulla tua configurazione astrale, pianeti, case e tutti i segreti celesti.\n\n✨ *L'universo ha aperto tutte le porte per te* ✨",
          timestamp: new Date(),
          isUser: false,
        };
        this.messages.push(premiumMessage);
        this.shouldScrollToBottom = true;
        this.saveMessagesToSession();
        break;
      // ✅ ELIMINADO: case '3' - 2 Consultas Extra
      case '4': // Otra oportunidad
        break;
      default:
    }
  }
  private addFreeBirthChartConsultations(count: number): void {
    const current = parseInt(
      sessionStorage.getItem('freeBirthChartConsultations') || '0'
    );
    const newTotal = current + count;
    sessionStorage.setItem('freeBirthChartConsultations', newTotal.toString());

    if (this.blockedMessageId && !this.hasUserPaidForBirthTable) {
      this.blockedMessageId = null;
      sessionStorage.removeItem('birthChartBlockedMessageId');
    }
  }

  private hasFreeBirthChartConsultationsAvailable(): boolean {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeBirthChartConsultations') || '0'
    );
    return freeConsultations > 0;
  }

  private useFreeBirthChartConsultation(): void {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeBirthChartConsultations') || '0'
    );

    if (freeConsultations > 0) {
      const remaining = freeConsultations - 1;
      sessionStorage.setItem(
        'freeBirthChartConsultations',
        remaining.toString()
      );

      const prizeMsg: Message = {
        sender: 'Maestra Emma',
        content: `✨ *Hai utilizzato una lettura astrale gratuita* ✨\n\nTi rimangono **${remaining}** consultazioni celesti disponibili.`,
        timestamp: new Date(),
        isUser: false,
      };
      this.messages.push(prizeMsg);
      this.shouldScrollToBottom = true;
      this.saveMessagesToSession();
    }
  }

  debugBirthChartWheel(): void {
    this.showFortuneWheel = true;
    this.cdr.markForCheck();
  }

  // ✅ MÉTODO AUXILIAR para el template
  getBirthChartConsultationsCount(): number {
    return parseInt(
      sessionStorage.getItem('freeBirthChartConsultations') || '0'
    );
  }

  // ✅ MÉTODO AUXILIAR para parsing en template
  parseInt(value: string): number {
    return parseInt(value);
  }

  // ✅ MODIFICAR clearChat para incluir datos de la ruleta
}
