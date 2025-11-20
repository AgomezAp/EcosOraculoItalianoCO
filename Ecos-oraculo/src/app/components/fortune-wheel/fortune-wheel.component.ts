import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  ChangeDetectorRef,
} from '@angular/core';
export interface Prize {
  id: string;
  name: string;
  color: string;
  textColor?: string;
  icon?: string;
}

@Component({
  selector: 'app-fortune-wheel',
  imports: [CommonModule],
  standalone: true,
  templateUrl: './fortune-wheel.component.html',
  styleUrl: './fortune-wheel.component.css',
})
export class FortuneWheelComponent implements OnInit, OnDestroy {
  @Input() isVisible: boolean = false;
  @Input() prizes: Prize[] = [
    { id: '1', name: '3 Giri Gratuiti', color: '#4ecdc4', icon: '🎲' },
    { id: '2', name: '1 Consulto Premium', color: '#45b7d1', icon: '🔮' },
    { id: '4', name: 'Riprova!', color: '#ff7675', icon: '🔄' },
  ];

  @Output() onPrizeWon = new EventEmitter<Prize>();
  @Output() onWheelClosed = new EventEmitter<void>();

  @ViewChild('wheelElement') wheelElement!: ElementRef;

  // ✅ PROPRIETÀ PER LA RUOTA
  segmentAngle: number = 0;
  currentRotation: number = 0;
  isSpinning: boolean = false;
  selectedPrize: Prize | null = null;
  wheelSpinning: boolean = false;

  // ✅ CONTROLLO STATO MIGLIORATO
  canSpinWheel: boolean = true;
  isProcessingClick: boolean = false; // ✅ NUOVO: Prevenire clic multipli
  hasUsedDailyFreeSpIn: boolean = false;
  nextFreeSpinTime: Date | null = null;
  spinCooldownTimer: any;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.segmentAngle = 360 / this.prizes.length;
    this.checkSpinAvailability();
    this.startSpinCooldownTimer();
  }

  ngOnDestroy(): void {
    if (this.spinCooldownTimer) {
      clearInterval(this.spinCooldownTimer);
    }
  }
  get currentWheelSpins(): number {
    return this.getWheelSpinsCount();
  }
  // ✅ METODO PRINCIPALE PER VERIFICARE SE PUÒ MOSTRARE LA RUOTA
  static canShowWheel(): boolean {
    const wheelSpins = parseInt(sessionStorage.getItem('wheelSpins') || '0');
    const lastSpinDate = sessionStorage.getItem('lastWheelSpinDate');
    const today = new Date().toDateString();


    // Ha giri extra per la ruota
    if (wheelSpins > 0) {
      return true;
    }

    // Utente nuovo (non ha girato mai)
    if (!lastSpinDate) {
      return true;
    }

    // Ha già usato il suo giro giornaliero gratuito
    if (lastSpinDate === today) {
      return false;
    }

    // Nuovo giorno - può usare giro gratuito
    return true;
  }

  // ✅ METODO STATICO PER VERIFICARE DA ALTRI COMPONENTI
  static getSpinStatus(): string {
    const wheelSpins = parseInt(sessionStorage.getItem('wheelSpins') || '0');
    const lastSpinDate = sessionStorage.getItem('lastWheelSpinDate');
    const today = new Date().toDateString();

    if (wheelSpins > 0) {
      return `${wheelSpins} giri di ruota disponibili`;
    }

    if (!lastSpinDate) {
      return 'Giro gratuito disponibile';
    }

    if (lastSpinDate !== today) {
      return 'Giro giornaliero disponibile';
    }

    return 'Nessun giro disponibile oggi';
  }

  // ✅ VERIFICARE DISPONIBILITÀ DEI GIRI
  checkSpinAvailability(): void {
    const lastSpinDate = sessionStorage.getItem('lastWheelSpinDate');
    const today = new Date().toDateString();
    const wheelSpins = this.getWheelSpinsCount();


    if (!lastSpinDate) {
      // Utente nuovo - prima volta
      this.canSpinWheel = true;
      this.hasUsedDailyFreeSpIn = false;
      return;
    }

    // Verificare se ha già usato giro giornaliero oggi
    if (lastSpinDate === today) {
      this.hasUsedDailyFreeSpIn = true;
      // Può girare solo se ha giri extra
      this.canSpinWheel = wheelSpins > 0;
    } else {
      // Nuovo giorno - può usare giro gratuito
      this.hasUsedDailyFreeSpIn = false;
      this.canSpinWheel = true;
    }

  }

  async spinWheel() {
    // ✅ VALIDAZIONI STRETTE
    if (this.isProcessingClick) {
      return;
    }

    if (!this.canSpinWheel || this.wheelSpinning || this.isSpinning) {
      return;
    }

    // ✅ BLOCCARE IMMEDIATAMENTE
    this.isProcessingClick = true;

    // ✅ MOSTRARE STATO PRIMA DEL GIRO
    const wheelSpinsBefore = this.getWheelSpinsCount();
    const dreamConsultationsBefore = this.getDreamConsultationsCount();
    try {
      // ✅ STATI DI BLOCCO
      this.wheelSpinning = true;
      this.isSpinning = true;
      this.canSpinWheel = false;
      this.selectedPrize = null;
      this.cdr.markForCheck(); // ✅ Rilevare cambiamenti

      // ✅ USARE GIRO IMMEDIATAMENTE (QUESTO DIMINUISCE IL CONTATORE)
      this.handleSpinUsage();

      // ✅ VERIFICARE STATO DOPO L'USO
      const wheelSpinsAfter = this.getWheelSpinsCount();

      // ✅ DETERMINARE PREMIO VINTO
      const wonPrize = this.determineWonPrize();

      // ✅ ANIMAZIONE DI ROTAZIONE
      const minSpins = 6;
      const maxSpins = 10;
      const randomSpins = Math.random() * (maxSpins - minSpins) + minSpins;
      const finalRotation = randomSpins * 360;

      // Applicare rotazione graduale
      this.currentRotation += finalRotation;

      await this.waitForAnimation(3000);

      // ✅ FINALIZZARE STATI DI ANIMAZIONE
      this.wheelSpinning = false;
      this.isSpinning = false;
      this.selectedPrize = wonPrize;
      this.cdr.markForCheck(); // ✅ Rilevare cambiamenti CRITICO


      // ✅ ELABORARE PREMIO (QUESTO PUÒ AGGIUNGERE PIÙ GIRI/CONSULTI)
      await this.processPrizeWon(wonPrize);

      // ✅ STATO DOPO ELABORAZIONE PREMIO
      const finalWheelSpins = this.getWheelSpinsCount();
      const finalDreamConsultations = this.getDreamConsultationsCount();
      this.updateSpinAvailabilityAfterPrize(wonPrize);

      // ✅ EMETTERE EVENTO DEL PREMIO
      this.onPrizeWon.emit(wonPrize);

      this.cdr.markForCheck(); // ✅ Rilevare cambiamenti finali

    } catch (error) {

      // ✅ RESETTARE STATI IN CASO DI ERRORE
      this.wheelSpinning = false;
      this.isSpinning = false;
      this.selectedPrize = null;
      this.cdr.markForCheck(); // ✅ Rilevare cambiamenti in errore

      // Ripristinare disponibilità
      this.checkSpinAvailability();
    } finally {
      // ✅ LIBERARE BLOCCO DOPO UN DELAY
      setTimeout(() => {
        this.isProcessingClick = false;

        // ✅ VERIFICA FINALE DI DISPONIBILITÀ
        this.checkSpinAvailability();

        this.cdr.markForCheck(); // ✅ Rilevare cambiamenti al liberare

      }, 1000);
    }

  }
  private updateSpinAvailabilityAfterPrize(wonPrize: Prize): void {

    const wheelSpins = this.getWheelSpinsCount();
    const today = new Date().toDateString();
    const lastSpinDate = sessionStorage.getItem('lastWheelSpinDate');


    // ✅ LOGICA DI DISPONIBILITÀ
    if (wheelSpins > 0) {
      // Ha giri extra disponibili
      this.canSpinWheel = true;
    } else if (!this.hasUsedDailyFreeSpIn) {
      // Verificare se può usare giro giornaliero (non dovrebbe arrivare qui dopo averne usato uno)
      this.canSpinWheel = lastSpinDate !== today;
    } else {
      // Ha già usato il suo giro giornaliero e non ha extra
      this.canSpinWheel = false;
    }

  }
  // ✅ FUNZIONE AUSILIARIA PER ASPETTARE
  private waitForAnimation(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  private handleSpinUsage(): void {
    const wheelSpins = this.getWheelSpinsCount();
    const today = new Date().toDateString();
    const lastSpinDate = sessionStorage.getItem('lastWheelSpinDate');


    if (wheelSpins > 0) {
      // ✅ USARE GIRO EXTRA DI RUOTA
      const newCount = wheelSpins - 1;
      sessionStorage.setItem('wheelSpins', newCount.toString());

      // ✅ AGGIORNARE IMMEDIATAMENTE LA DISPONIBILITÀ
      this.checkSpinAvailability();
    } else {
      // ✅ USARE GIRO GIORNALIERO GRATUITO
      sessionStorage.setItem('lastWheelSpinDate', today);
      sessionStorage.setItem('lastWheelSpinTime', Date.now().toString());
      this.hasUsedDailyFreeSpIn = true;
    }
  }

  // ✅ ELABORARE PREMIO VINTO (MIGLIORATO)
  private async processPrizeWon(prize: Prize): Promise<void> {

    switch (prize.id) {
      case '1': // 3 Giri Gratuiti di Ruota
        this.grantWheelSpins(3);
        break;
      case '2': // 1 Consulto Gratuito di Sogni
        this.grantDreamConsultations(1);
        break;
      case '4': // Riprova
        this.grantRetryChance();
        break;
      default:
    }

    this.savePrizeToHistory(prize);
  }

  // ✅ CONCEDERE GIRI DI RUOTA (SEPARATO)
  private grantWheelSpins(count: number): void {
    const currentSpins = this.getWheelSpinsCount();
    sessionStorage.setItem('wheelSpins', (currentSpins + count).toString());
  }

  // ✅ CONCEDERE CONSULTE DI SOGNI (SEPARATO)
  private grantDreamConsultations(count: number): void {
    const currentConsultations = parseInt(
      sessionStorage.getItem('dreamConsultations') || '0'
    );
    sessionStorage.setItem(
      'dreamConsultations',
      (currentConsultations + count).toString()
    );

    // Sbloccare messaggio se ce n'era uno bloccato
    const blockedMessageId = sessionStorage.getItem('blockedMessageId');
    const hasUserPaid =
      sessionStorage.getItem('hasUserPaidForDreams') === 'true';

    if (blockedMessageId && !hasUserPaid) {
      sessionStorage.removeItem('blockedMessageId');
    }
  }

  // ✅ CONCEDERE UN'ALTRA OPPORTUNITÀ (NUOVO)
  private grantRetryChance(): void {
  }
  shouldShowContinueButton(prize: Prize | null): boolean {
    if (!prize) return false;

    // Premi che concedono giri extra (non chiudere modal)
    const spinsGrantingPrizes = ['1', '4']; // Solo 3 giri e riprova
    return spinsGrantingPrizes.includes(prize.id);
  }
  shouldShowCloseButton(prize: Prize | null): boolean {
    if (!prize) return false;
    return prize.id === '2';
  }
  continueSpinning(): void {

    // ✅ RESETTARE STATO PER PERMETTERE UN ALTRO GIRO
    this.selectedPrize = null;
    this.isProcessingClick = false;
    this.wheelSpinning = false;
    this.isSpinning = false;

    // ✅ VERIFICARE DISPONIBILITÀ AGGIORNATA
    this.checkSpinAvailability();

    this.cdr.markForCheck(); // ✅ Rilevare cambiamenti

  }

  // ✅ METODI AUSILIARI AGGIORNATI
  hasFreeSpinsAvailable(): boolean {
    return this.getWheelSpinsCount() > 0;
  }

  getWheelSpinsCount(): number {
    return parseInt(sessionStorage.getItem('wheelSpins') || '0');
  }

  getFreeSpinsCount(): number {
    // Mantenere compatibilità con template
    return this.getWheelSpinsCount();
  }

  getDreamConsultationsCount(): number {
    return parseInt(sessionStorage.getItem('dreamConsultations') || '0');
  }

  getTimeUntilNextSpin(): string {
    if (!this.nextFreeSpinTime) return '';

    const now = new Date().getTime();
    const timeLeft = this.nextFreeSpinTime.getTime() - now;

    if (timeLeft <= 0) return '';

    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  }

  // ✅ DETERMINARE PREMIO (SENZA CAMBIAMENTI)
  private determineWonPrize(): Prize {
    const random = Math.random();

    if (random < 0.2) {
      return this.prizes[0]; // 20% - 3 Giri Gratuiti
    } else if (random < 0.35) {
      return this.prizes[1]; // 15% - 1 Consulto Premium
    } else {
      return this.prizes[2]; // 65% - Riprova
    }
  }

  // ✅ SALVARE PREMIO IN STORIA
  private savePrizeToHistory(prize: Prize): void {
    const prizeHistory = JSON.parse(
      sessionStorage.getItem('prizeHistory') || '[]'
    );
    prizeHistory.push({
      prize: prize,
      timestamp: new Date().toISOString(),
      claimed: true,
    });
    sessionStorage.setItem('prizeHistory', JSON.stringify(prizeHistory));
  }

  // ✅ TIMER PER COOLDOWN
  startSpinCooldownTimer(): void {
    if (this.spinCooldownTimer) {
      clearInterval(this.spinCooldownTimer);
    }

    if (this.nextFreeSpinTime && !this.canSpinWheel) {
      this.spinCooldownTimer = setInterval(() => {
        const now = new Date().getTime();
        const timeLeft = this.nextFreeSpinTime!.getTime() - now;

        if (timeLeft <= 0) {
          this.canSpinWheel = true;
          this.nextFreeSpinTime = null;
          clearInterval(this.spinCooldownTimer);
          this.cdr.markForCheck(); // ✅ Rilevare cambiamenti quando finisce cooldown
        }
      }, 1000);
    }
  }

  // ✅ CHIUDERE RUOTA
  closeWheel() {
    this.onWheelClosed.emit();
    this.resetWheel();
    this.cdr.markForCheck(); // ✅ Rilevare cambiamenti al chiudere
  }

  // ✅ RESET RUOTA
  private resetWheel() {
    this.selectedPrize = null;
    this.wheelSpinning = false;
    this.isSpinning = false;
    this.isProcessingClick = false;
    this.cdr.markForCheck(); // ✅ Rilevare cambiamenti al resettare
  }

  // ✅ METODO PER CHIUDERE DA TEMPLATE
  onWheelClosedHandler() {
    this.closeWheel();
  }
}
