import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ZodiacoChinoService } from '../../services/zodiaco-chino.service';
import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PaypalService } from '../../services/paypal.service';

import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environmets.prod';
import { RecolectaDatosComponent } from '../recolecta-datos/recolecta-datos.component';
import {
  FortuneWheelComponent,
  Prize,
} from '../fortune-wheel/fortune-wheel.component';

interface ChatMessage {
  role: 'user' | 'master';
  message: string;
  timestamp?: string;
  id?: string;
}

interface MasterInfo {
  success: boolean;
  master: {
    name: string;
    title: string;
    specialty: string;
    description: string;
    services: string[];
  };
  timestamp: string;
}

interface ZodiacAnimal {
  animal?: string;
  symbol?: string;
  year?: number;
  element?: string;
  traits?: string[];
}
@Component({
  selector: 'app-zodiaco-chino',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RecolectaDatosComponent,
  ],
  templateUrl: './zodiaco-chino.component.html',
  styleUrl: './zodiaco-chino.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZodiacoChinoComponent
  implements OnInit, AfterViewChecked, OnDestroy, AfterViewInit
{
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  // Propiedades principales
  masterInfo: MasterInfo | null = null;
  userForm: FormGroup;
  isFormCompleted = false;
  isLoading = false;
  currentMessage = '';
  conversationHistory: ChatMessage[] = [];
  zodiacAnimal: ZodiacAnimal = {};
  showDataForm = true;
  isTyping: boolean = false;
  private shouldScrollToBottom = false;
  private shouldAutoScroll = true;
  private lastMessageCount = 0;
  //Variables para control de fortuna
  showFortuneWheel: boolean = false;
  horoscopePrizes: Prize[] = [
    {
      id: '1',
      name: '3 giri della Ruota del Segno Zodiacale',
      color: '#4ecdc4',
      icon: '🔮',
    },
    {
      id: '2',
      name: '1 Analisi Premium del Segno Zodiacale',
      color: '#45b7d1',
      icon: '✨',
    },
    {
      id: '4',
      name: 'Riprova!',
      color: '#ff7675',
      icon: '🌙',
    },
  ];
  private wheelTimer: any;
  // Variables para control de pagos
  showPaymentModal: boolean = false;

  clientSecret: string | null = null;
  isProcessingPayment: boolean = false;
  paymentError: string | null = null;
  hasUserPaidForHoroscope: boolean = false;
  blockedMessageId: string | null = null;

  // ✅ NUEVO: Sistema de 3 mensajes gratis
  private userMessageCount: number = 0;
  private readonly FREE_MESSAGES_LIMIT = 3;

  //Datos para enviar
  showDataModal: boolean = false;
  userData: any = null;
  private backendUrl = environment.apiUrl;

  constructor(
    private fb: FormBuilder,
    private zodiacoChinoService: ZodiacoChinoService,
    private http: HttpClient,
    private elRef: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
    private paypalService: PaypalService
  ) {
    // Configuración del formulario para horóscopo
    this.userForm = this.fb.group({
      fullName: [''],
      birthYear: [
        '',
        [Validators.required, Validators.min(1900), Validators.max(2024)],
      ],
      birthDate: [''],
      initialQuestion: [
        'Cosa puoi dirmi sul mio segno zodiacale e oroscopo?',
      ],
    });
  }
  ngAfterViewInit(): void {
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
  async ngOnInit(): Promise<void> {
    // ✅ Verificar si venimos de PayPal después de un pago
    this.hasUserPaidForHoroscope =
      sessionStorage.getItem('hasUserPaidForHoroscope_horoskop') === 'true';

    const paymentStatus = this.paypalService.checkPaymentStatusFromUrl();

    if (paymentStatus && paymentStatus.status === 'COMPLETED') {
      try {
        const verification = await this.paypalService.verifyAndProcessPayment(
          paymentStatus.token
        );

        if (verification.valid && verification.status === 'approved') {
          // ✅ Pago SOLO para este servicio (Horoskop)
          this.hasUserPaidForHoroscope = true;
          sessionStorage.setItem('hasUserPaidForHoroscope_horoskop', 'true');

          // NO usar localStorage global
          localStorage.removeItem('paypal_payment_completed');

          this.blockedMessageId = null;
          sessionStorage.removeItem('horoscopeBlockedMessageId');

          // Limpiar URL
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );

          // Cerrar modal de pago
          this.showPaymentModal = false;
          this.isProcessingPayment = false;
          this.paymentError = null;
          this.cdr.markForCheck();

          // ✅ MENSAJE DE CONFIRMACIÓN
          setTimeout(() => {
            this.addMessage(
              'master',
              '🎉 Pagamento completato con successo!\n\n' +
                '✨ Grazie per il tuo pagamento. Ora hai accesso completo all\'Oroscopo Cinese.\n\n' +
                '🐉 Scopriamo insieme il tuo futuro astrologico!\n\n' +
                '📌 Nota: Questo pagamento è valido solo per il servizio Oroscopo. Per altri servizi è richiesto un pagamento separato.'
            );
            this.cdr.detectChanges();
            setTimeout(() => this.scrollToBottom(), 200);
          }, 1000);
        } else {
          this.paymentError = 'Non è stato possibile verificare il pagamento.';

          setTimeout(() => {
            this.addMessage(
              'master',
              '⚠️ Si è verificato un problema nella verifica del tuo pagamento. Per favore, riprova o contatta il nostro supporto.'
            );
            this.cdr.detectChanges();
          }, 800);
        }
      } catch (error) {
        console.error('Errore nella verifica del pagamento PayPal:', error);
        this.paymentError = 'Errore nella verifica del pagamento';

        setTimeout(() => {
          this.addMessage(
            'master',
            '❌ Purtroppo si è verificato un errore nella verifica del tuo pagamento. Per favore, riprova più tardi.'
          );
          this.cdr.detectChanges();
        }, 800);
      }
    }

    // ✅ NUEVO: Cargar contador de mensajes
    const savedMessageCount = sessionStorage.getItem('horoscopeUserMessageCount');
    if (savedMessageCount) {
      this.userMessageCount = parseInt(savedMessageCount, 10);
    }

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

    // Cargar datos guardados específicos del horóscopo
    this.loadHoroscopeData();

    this.loadMasterInfo();

    // Solo agregar mensaje de bienvenida si no hay mensajes guardados
    if (this.conversationHistory.length === 0) {
      this.initializeHoroscopeWelcomeMessage();
    }

    // ✅ TAMBIÉN VERIFICAR PARA MENSAJES RESTAURADOS
    if (
      this.conversationHistory.length > 0 &&
      FortuneWheelComponent.canShowWheel()
    ) {
      this.showHoroscopeWheelAfterDelay(2000);
    }
  }
  private loadHoroscopeData(): void {
    const savedMessages = sessionStorage.getItem('horoscopeMessages');
    const savedBlockedMessageId = sessionStorage.getItem(
      'horoscopeBlockedMessageId'
    );

    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);
        this.conversationHistory = parsedMessages.map((msg: any) => ({
          ...msg,
          timestamp: msg.timestamp,
        }));
        this.blockedMessageId = savedBlockedMessageId || null;
      } catch (error) {
        this.clearHoroscopeSessionData();
        this.initializeHoroscopeWelcomeMessage();
      }
    }
  }
  private initializeHoroscopeWelcomeMessage(): void {
    const welcomeMessage = `Benvenuto nel Regno delle Stelle! 🔮✨

Sono l'Astrologa Maria, guida celeste dei segni zodiacali. Per decenni ho studiato le influenze dei pianeti e delle costellazioni che guidano il nostro destino.

Ogni persona nasce sotto la protezione di un segno zodiacale che influenza la sua personalità, il suo destino e il suo percorso di vita. Per rivelare i segreti del tuo oroscopo e le influenze celesti, ho bisogno della tua data di nascita.

I dodici segni (Ariete, Toro, Gemelli, Cancro, Leone, Vergine, Bilancia, Scorpione, Sagittario, Capricorno, Acquario e Pesci) hanno saggezza ancestrale da condividere.

Sei pronto a scoprire cosa rivelano le stelle sul tuo destino? 🌙`;

    this.addMessage('master', welcomeMessage);

    // ✅ VERIFICACIÓN DE RULETA HOROSCÓPICA
    if (FortuneWheelComponent.canShowWheel()) {
      this.showHoroscopeWheelAfterDelay(3000);
    } else {
    }
  }
  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }

    if (
      this.shouldAutoScroll &&
      this.conversationHistory.length > this.lastMessageCount
    ) {
      this.scrollToBottom();
      this.lastMessageCount = this.conversationHistory.length;
    }
  }

  ngOnDestroy(): void {
    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
    }
  }

  private saveHoroscopeMessagesToSession(): void {
    try {
      const messagesToSave = this.conversationHistory.map((msg) => ({
        ...msg,
        timestamp: msg.timestamp,
      }));
      sessionStorage.setItem(
        'horoscopeMessages',
        JSON.stringify(messagesToSave)
      );
    } catch (error) {}
  }

  private clearHoroscopeSessionData(): void {
    sessionStorage.removeItem('hasUserPaidForHoroscope');
    sessionStorage.removeItem('horoscopeMessages');
    sessionStorage.removeItem('horoscopeBlockedMessageId');
    sessionStorage.removeItem('horoscopeUserMessageCount');
    sessionStorage.removeItem('freeHoroscopeConsultations');
    sessionStorage.removeItem('pendingHoroscopeMessage');
  }

  private saveHoroscopeStateBeforePayment(): void {
    this.saveHoroscopeMessagesToSession();
    sessionStorage.setItem(
      'horoscopeUserMessageCount',
      this.userMessageCount.toString()
    );
    if (this.blockedMessageId) {
      sessionStorage.setItem(
        'horoscopeBlockedMessageId',
        this.blockedMessageId
      );
    }
  }

  isMessageBlocked(message: ChatMessage): boolean {
    return (
      message.id === this.blockedMessageId && !this.hasUserPaidForHoroscope
    );
  }

  // ✅ MÉTODO MIGRADO A PAYPAL
  async promptForHoroscopePayment(): Promise<void> {
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
        'Dati del cliente non trovati. Per favore, completa prima il modulo.';
      this.showDataModal = true;
      this.cdr.markForCheck();
      return;
    }
    const email = this.userData.email?.toString().trim();
    if (!email) {
      this.paymentError =
        'Email richiesta. Per favore, completa il modulo.';
      this.showDataModal = true;
      this.cdr.markForCheck();
      return;
    }

    // Guardar mensaje pendiente si existe
    if (this.currentMessage) {
      sessionStorage.setItem('pendingHoroscopeMessage', this.currentMessage);
    }
  }

  // ✅ MÉTODO MIGRADO A PAYPAL
  async handleHoroscopePaymentSubmit(): Promise<void> {
    this.isProcessingPayment = true;
    this.paymentError = null;
    this.cdr.markForCheck();

    try {
      // Iniciar el flujo de pago de PayPal (redirige al usuario)
      await this.paypalService.initiatePayment({
        amount: '4.00',
        currency: 'EUR',
        serviceName: 'Oroscopo',
        returnPath: '/oroscopo',
        cancelPath: '/oroscopo',
      });

      // El código después de esta línea NO se ejecutará porque
      // el usuario será redirigido a PayPal
    } catch (error: any) {
      this.paymentError =
        error.message || 'Errore nell\'iniziare il pagamento PayPal.';
      this.isProcessingPayment = false;
      this.cdr.markForCheck();
    }
  }

  // ✅ MÉTODO SIMPLIFICADO - PayPal no requiere cleanup
  cancelHoroscopePayment(): void {
    this.showPaymentModal = false;
    this.isProcessingPayment = false;
    this.paymentError = null;
    this.cdr.markForCheck();
  }

  startChatWithoutForm(): void {
    this.showDataForm = false;
  }

  // Cargar información del maestro
  loadMasterInfo(): void {
    this.zodiacoChinoService.getMasterInfo().subscribe({
      next: (info) => {
        this.masterInfo = info;
      },
      error: (error) => {
        // Información predeterminada en caso de error
        this.masterInfo = {
          success: true,
          master: {
            name: 'Astrologa Maria',
            title: 'Guida Celeste dei Segni',
            specialty: 'Astrologia Occidentale e Oroscopo Personalizzato',
            description:
              'Astrologa saggia, specializzata nell\'interpretazione delle influenze celesti e nella saggezza dei dodici segni zodiacali',
            services: [
              'Interpretazione dei segni zodiacali',
              'Analisi delle carte astrali',
              'Previsioni dell\'oroscopo',
              'Compatibilità tra segni',
              'Consigli basati sull\'astrologia',
            ],
          },
          timestamp: new Date().toISOString(),
        };
      },
    });
  }

  // Iniciar consulta del horóscopo
  startConsultation(): void {
    if (this.userForm.valid && !this.isLoading) {
      this.isLoading = true;
      this.cdr.markForCheck();

      const formData = this.userForm.value;

      const initialMessage =
        formData.initialQuestion ||
        'Ciao! Vorrei sapere di più sul mio segno zodiacale e oroscopo.';

      // Agregar mensaje del usuario
      this.addMessage('user', initialMessage);

      // Preparar datos para enviar al backend
      const consultationData = {
        zodiacData: {
          name: 'Astrologa Maria',
          specialty: 'Astrologia Occidentale e Oroscopo Personalizzato',
          experience: 'Decenni di esperienza nell\'interpretazione astrologica',
        },
        userMessage: initialMessage,
        fullName: formData.fullName,
        birthYear: formData.birthYear?.toString(),
        birthDate: formData.birthDate,
        conversationHistory: this.conversationHistory,
      };

      // ✅ Llamar al servicio con contador de mensajes (mensaje inicial = 1)
      this.zodiacoChinoService
        .chatWithMasterWithCount(consultationData, 1, this.hasUserPaidForHoroscope)
        .subscribe({
          next: (response) => {
            this.isLoading = false;
            if (response.success && response.response) {
              this.addMessage('master', response.response);
              this.isFormCompleted = true;
              this.showDataForm = false;
              this.saveHoroscopeMessagesToSession();
              this.cdr.markForCheck();
            } else {
              this.handleError('Errore nella risposta dell\'astrologa');
            }
          },
          error: (error) => {
            this.isLoading = false;
            this.handleError(
              'Errore nella connessione con l\'astrologa: ' +
                (error.error?.error || error.message)
            );
            this.cdr.markForCheck();
          },
        });
    }
  }

  // ✅ NUEVO: Obtener mensajes gratis restantes
  getFreeMessagesRemaining(): number {
    if (this.hasUserPaidForHoroscope) {
      return -1; // Ilimitado
    }
    return Math.max(0, this.FREE_MESSAGES_LIMIT - this.userMessageCount);
  }

  sendMessage(): void {
    if (this.currentMessage.trim() && !this.isLoading) {
      const message = this.currentMessage.trim();

      // Calcular el próximo número de mensaje
      const nextMessageCount = this.userMessageCount + 1;

      console.log(
        `📊 Oroscopo - Messaggio #${nextMessageCount}, Premium: ${this.hasUserPaidForHoroscope}, Limite: ${this.FREE_MESSAGES_LIMIT}`
      );

      // ✅ Verificar acceso
      const canSendMessage =
        this.hasUserPaidForHoroscope ||
        this.hasFreeHoroscopeConsultationsAvailable() ||
        nextMessageCount <= this.FREE_MESSAGES_LIMIT;

      if (!canSendMessage) {
        console.log('❌ Senza accesso - mostrando modal di pagamento');

        // Cerrar otros modales
        this.showFortuneWheel = false;
        this.showPaymentModal = false;

        // Guardar mensaje pendiente
        sessionStorage.setItem('pendingHoroscopeMessage', message);
        this.saveHoroscopeStateBeforePayment();

        // Mostrar modal de datos
        setTimeout(() => {
          this.showDataModal = true;
          this.cdr.markForCheck();
        }, 100);

        return;
      }

      // ✅ Si usa consulta gratis de ruleta (después de los 3 gratis)
      if (
        !this.hasUserPaidForHoroscope &&
        nextMessageCount > this.FREE_MESSAGES_LIMIT &&
        this.hasFreeHoroscopeConsultationsAvailable()
      ) {
        this.useFreeHoroscopeConsultation();
      }

      // Procesar mensaje normalmente
      this.processHoroscopeUserMessage(message, nextMessageCount);
    }
  }
  private processHoroscopeUserMessage(message: string, messageCount: number): void {
    this.currentMessage = '';
    this.isLoading = true;
    this.isTyping = true;
    this.cdr.markForCheck();

    // Agregar mensaje del usuario
    this.addMessage('user', message);

    // ✅ Actualizar contador
    this.userMessageCount = messageCount;
    sessionStorage.setItem(
      'horoscopeUserMessageCount',
      this.userMessageCount.toString()
    );

    const formData = this.userForm.value;
    const consultationData = {
      zodiacData: {
        name: 'Astrologa Maria',
        specialty: 'Astrologia Occidentale e Oroscopo Personalizzato',
        experience: 'Decenni di esperienza nell\'interpretazione astrologica',
      },
      userMessage: message,
      fullName: formData.fullName,
      birthYear: formData.birthYear?.toString(),
      birthDate: formData.birthDate,
      conversationHistory: this.conversationHistory,
    };

    // ✅ Llamar al servicio con contador de mensajes
    this.zodiacoChinoService
      .chatWithMasterWithCount(
        consultationData,
        messageCount,
        this.hasUserPaidForHoroscope
      )
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          this.isTyping = false;
          this.cdr.markForCheck();

          if (response.success && response.response) {
            const messageId = Date.now().toString();

            this.addMessage('master', response.response, messageId);

            // ✅ Mostrar paywall si superó el límite gratuito Y no tiene consultas de ruleta
            const shouldShowPaywall =
              !this.hasUserPaidForHoroscope &&
              messageCount > this.FREE_MESSAGES_LIMIT &&
              !this.hasFreeHoroscopeConsultationsAvailable();

            if (shouldShowPaywall) {
              this.blockedMessageId = messageId;
              sessionStorage.setItem('horoscopeBlockedMessageId', messageId);

              setTimeout(() => {
                this.saveHoroscopeStateBeforePayment();

                // Cerrar otros modales
                this.showFortuneWheel = false;
                this.showPaymentModal = false;

                // Mostrar modal de datos
                setTimeout(() => {
                  this.showDataModal = true;
                  this.cdr.markForCheck();
                }, 100);
              }, 2000);
            }

            this.saveHoroscopeMessagesToSession();
            this.cdr.markForCheck();
          } else {
            this.handleError('Errore nella risposta dell\'astrologa');
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.isTyping = false;
          this.handleError(
            'Errore nella connessione con l\'astrologa: ' +
            (error.error?.error || error.message)
        );
        this.cdr.markForCheck();
      },
    });
  }

  // Manejar tecla Enter
  onEnterKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  // Alternar formulario
  toggleDataForm(): void {
    this.showDataForm = !this.showDataForm;
  }

  // Reiniciar consulta
  resetConsultation(): void {
    this.conversationHistory = [];
    this.isFormCompleted = false;
    this.showDataForm = true;
    this.currentMessage = '';
    this.zodiacAnimal = {};
    this.blockedMessageId = null;

    // ✅ Resetear contador
    if (!this.hasUserPaidForHoroscope) {
      this.userMessageCount = 0;
      this.clearHoroscopeSessionData();
    } else {
      sessionStorage.removeItem('horoscopeMessages');
      sessionStorage.removeItem('horoscopeBlockedMessageId');
      sessionStorage.removeItem('horoscopeUserMessageCount');
      this.userMessageCount = 0;
    }

    this.userForm.reset({
      fullName: '',
      birthYear: '',
      birthDate: '',
      initialQuestion:
        'Cosa puoi dirmi sul mio segno zodiacale e oroscopo?',
    });
    this.initializeHoroscopeWelcomeMessage();
  }

  // Explorar compatibilidad
  exploreCompatibility(): void {
    const message =
      'Potresti parlare della compatibilità del mio segno zodiacale con altri segni?';
    this.currentMessage = message;
    this.sendMessage();
  }

  // Explorar elementos
  exploreElements(): void {
    const message = 'Come influenzano i pianeti la mia personalità e il mio destino?';
    this.currentMessage = message;
    this.sendMessage();
  }

  // Métodos auxiliares
  private addMessage(
    role: 'user' | 'master',
    message: string,
    id?: string
  ): void {
    const newMessage: ChatMessage = {
      role,
      message,
      timestamp: new Date().toISOString(),
      id: id || undefined,
    };
    this.conversationHistory.push(newMessage);
    this.shouldScrollToBottom = true;
    this.saveHoroscopeMessagesToSession();
    this.cdr.markForCheck();
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      try {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      } catch (err) {}
    }
  }

  private handleError(message: string): void {
    this.addMessage(
      'master',
      `Mi dispiace, ${message}. Per favore, riprova.`
    );
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

  formatTime(timestamp?: string): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  trackByMessage(index: number, message: ChatMessage): string {
    return `${message.role}-${message.timestamp}-${index}`;
  }

  // Auto-resize del textarea
  autoResize(event: any): void {
    const textarea = event.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  // Manejar tecla Enter
  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  // Limpiar chat
  clearChat(): void {
    this.conversationHistory = [];
    this.currentMessage = '';
    this.blockedMessageId = null;
    this.isLoading = false;

    // ✅ Resetear contador
    if (!this.hasUserPaidForHoroscope) {
      this.userMessageCount = 0;
      sessionStorage.removeItem('horoscopeMessages');
      sessionStorage.removeItem('horoscopeBlockedMessageId');
      sessionStorage.removeItem('horoscopeUserMessageCount');
      sessionStorage.removeItem('freeHoroscopeConsultations');
      sessionStorage.removeItem('pendingHoroscopeMessage');
    } else {
      sessionStorage.removeItem('horoscopeMessages');
      sessionStorage.removeItem('horoscopeBlockedMessageId');
      sessionStorage.removeItem('horoscopeUserMessageCount');
      this.userMessageCount = 0;
    }

    this.shouldScrollToBottom = true;
    this.initializeHoroscopeWelcomeMessage();
  }
  resetChat(): void {
    // 1. Reset de arrays y mensajes
    this.conversationHistory = [];
    this.currentMessage = '';

    // 2. Reset de estados de carga y typing
    this.isLoading = false;
    this.isTyping = false;

    // 3. Reset de estados de formulario
    this.isFormCompleted = false;
    this.showDataForm = true;

    // 4. Reset de estados de pago y bloqueo
    this.blockedMessageId = null;

    // 5. Reset de modales
    this.showPaymentModal = false;
    this.showDataModal = false;
    this.showFortuneWheel = false;

    // 6. Reset de variables de scroll y contadores
    this.shouldScrollToBottom = false;
    this.shouldAutoScroll = true;
    this.lastMessageCount = 0;

    // 7. Reset del zodiac animal
    this.zodiacAnimal = {};

    // 8. ✅ PayPal no requiere cleanup de elementos
    this.isProcessingPayment = false;
    this.paymentError = null;

    // 9. Limpiar timers
    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
    }

    // 10. ✅ Resetear contador y limpiar sessionStorage
    if (!this.hasUserPaidForHoroscope) {
      this.userMessageCount = 0;
      sessionStorage.removeItem('horoscopeMessages');
      sessionStorage.removeItem('horoscopeBlockedMessageId');
      sessionStorage.removeItem('horoscopeUserMessageCount');
      sessionStorage.removeItem('freeHoroscopeConsultations');
      sessionStorage.removeItem('pendingHoroscopeMessage');
    } else {
      sessionStorage.removeItem('horoscopeMessages');
      sessionStorage.removeItem('horoscopeBlockedMessageId');
      sessionStorage.removeItem('horoscopeUserMessageCount');
      this.userMessageCount = 0;
    }

    // 11. Reset del formulario
    this.userForm.reset({
      fullName: '',
      birthYear: '',
      birthDate: '',
      initialQuestion:
        'Cosa puoi dirmi sul mio segno zodiacale e oroscopo?',
    });

    // 12. Reinicializar mensaje de bienvenida
    this.initializeHoroscopeWelcomeMessage();
    this.cdr.markForCheck();
  }
  onUserDataSubmitted(userData: any): void {
    // ✅ VALIDAR CAMPOS CRÍTICOS ANTES DE PROCEDER
    const requiredFields = ['email'];
    const missingFields = requiredFields.filter(
      (field) => !userData[field] || userData[field].toString().trim() === ''
    );

    if (missingFields.length > 0) {
      alert(
        `Per continuare, devi completare i seguenti campi: ${missingFields.join(
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
        this.promptForHoroscopePayment();
      },
      error: (error) => {
        this.promptForHoroscopePayment();
      },
    });
  }
  onDataModalClosed(): void {
    this.showDataModal = false;
    this.cdr.markForCheck();
  }
  showHoroscopeWheelAfterDelay(delayMs: number = 3000): void {
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
    const prizeMessage: ChatMessage = {
      role: 'master',
      message: `🔮 Le stelle hanno cospirato a tuo favore! Hai vinto: **${prize.name}** ${prize.icon}\n\nLe forze celesti hanno deciso di benedirti con questo dono sacro. L'energia del segno zodiacale fluisce attraverso di te, rivelando segreti più profondi del tuo oroscopo personale. Che la saggezza astrologica ti illumini!`,
      timestamp: new Date().toISOString(),
    };

    this.conversationHistory.push(prizeMessage);
    this.shouldScrollToBottom = true;
    this.saveHoroscopeMessagesToSession();

    this.processHoroscopePrize(prize);
  }

  onWheelClosed(): void {
    this.showFortuneWheel = false;
  }

  triggerHoroscopeWheel(): void {
    if (this.showPaymentModal || this.showDataModal) {
      return;
    }

    if (FortuneWheelComponent.canShowWheel()) {
      this.showFortuneWheel = true;
      this.cdr.markForCheck();
    } else {
      alert(
        'Non hai più giri disponibili. ' +
          FortuneWheelComponent.getSpinStatus()
      );
    }
  }

  getSpinStatus(): string {
    return FortuneWheelComponent.getSpinStatus();
  }

  private processHoroscopePrize(prize: Prize): void {
    switch (prize.id) {
      case '1': // 3 Lecturas Horoscópicas
        this.addFreeHoroscopeConsultations(3);
        break;
      case '2': // 1 Análisis Premium - ACCESO COMPLETO
        this.hasUserPaidForHoroscope = true;
        sessionStorage.setItem('hasUserPaidForHoroscope', 'true');

        // Desbloquear cualquier mensaje bloqueado
        if (this.blockedMessageId) {
          this.blockedMessageId = null;
          sessionStorage.removeItem('horoscopeBlockedMessageId');
        }

        // Agregar mensaje especial para este premio
        const premiumMessage: ChatMessage = {
          role: 'master',
          message:
            '🌟 **Hai sbloccato l\'accesso premium completo!** 🌟\n\nLe stelle ti hanno sorriso in modo eccezionale. Ora hai accesso illimitato a tutta la mia saggezza astrologica. Puoi consultare il tuo oroscopo, compatibilità, previsioni e tutti i segreti celesti tutte le volte che desideri.\n\n✨ *L\'universo ha aperto tutte le porte per te* ✨',
          timestamp: new Date().toISOString(),
        };
        this.conversationHistory.push(premiumMessage);
        this.shouldScrollToBottom = true;
        this.saveHoroscopeMessagesToSession();
        break;
      case '4': // Otra oportunidad
        break;
      default:
    }
  }

  private addFreeHoroscopeConsultations(count: number): void {
    const current = parseInt(
      sessionStorage.getItem('freeHoroscopeConsultations') || '0'
    );
    const newTotal = current + count;
    sessionStorage.setItem('freeHoroscopeConsultations', newTotal.toString());

    if (this.blockedMessageId && !this.hasUserPaidForHoroscope) {
      this.blockedMessageId = null;
      sessionStorage.removeItem('horoscopeBlockedMessageId');
    }
  }

  private hasFreeHoroscopeConsultationsAvailable(): boolean {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeHoroscopeConsultations') || '0'
    );
    return freeConsultations > 0;
  }

  private useFreeHoroscopeConsultation(): void {
    const freeConsultations = parseInt(
      sessionStorage.getItem('freeHoroscopeConsultations') || '0'
    );

    if (freeConsultations > 0) {
      const remaining = freeConsultations - 1;
      sessionStorage.setItem(
        'freeHoroscopeConsultations',
        remaining.toString()
      );

      const prizeMsg: ChatMessage = {
        role: 'master',
        message: `✨ *Hai utilizzato una lettura astrologica gratuita* ✨\n\nTi restano **${remaining}** consulte astrologiche disponibili.`,
        timestamp: new Date().toISOString(),
      };
      this.conversationHistory.push(prizeMsg);
      this.shouldScrollToBottom = true;
      this.saveHoroscopeMessagesToSession();
    }
  }

  debugHoroscopeWheel(): void {
    this.showFortuneWheel = true;
    this.cdr.markForCheck();
  }

  // ✅ MÉTODO AUXILIAR para el template
  getHoroscopeConsultationsCount(): number {
    return parseInt(
      sessionStorage.getItem('freeHoroscopeConsultations') || '0'
    );
  }
}