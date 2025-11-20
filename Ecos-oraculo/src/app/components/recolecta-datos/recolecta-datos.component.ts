import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecolectaService } from '../../services/recolecta.service';
import { Datos } from '../../interfaces/datos';

@Component({
  selector: 'app-recolecta-datos',
  imports: [CommonModule, FormsModule],
  templateUrl: './recolecta-datos.component.html',
  styleUrl: './recolecta-datos.component.css',
})
export class RecolectaDatosComponent {
  // ✅ Eventi di uscita
  @Output() onDataSubmitted = new EventEmitter<any>();
  @Output() onModalClosed = new EventEmitter<void>();
  constructor(private recolecta: RecolectaService) {}
  // ✅ Proprietà dei dati
  userData: any = {
    NIF: '',
    // numero_pasapote: '', // ❌ ELIMINATO
    // pais: '', // ❌ ELIMINATO
    nombre: '', // ✅ ORA INCLUDE NOME E COGNOME
    // apellido: '', // ❌ ELIMINATO - unificato con nombre
    direccion: '',
    // calle: '', // ❌ ELIMINATO
    codigo_postal: '',
    // ciudad: '', // ❌ ELIMINATO
    // provincia: '', // ❌ ELIMINATO
    // comunidad_autonoma: '', // ❌ ELIMINATO
    importe: 4.0,
    email: '',
    telefono: '', // ✅ RIPRISTINATO
  };
  aceptaTerminos = false;
  showTerminosError = false;
  datosVeridicos = false;
  showDatosVeridicosError = false;
  emailNotifications = false;
  // ✅ Controllo del formulario
  dataFormErrors: { [key: string]: string } = {};
  isValidatingData: boolean = false;
  attemptedDataSubmission: boolean = false;

  // ✅ Metodo per convalidare i dati
  validateUserData(): boolean {
    this.dataFormErrors = {};
    let isValid = true;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.userData.email || !this.userData.email.toString().trim()) {
      this.dataFormErrors['email'] = "L'email è obbligatoria";
      isValid = false;
    } else if (!emailRegex.test(this.userData.email.toString().trim())) {
      this.dataFormErrors['email'] = 'Inserisci un email valida';
      isValid = false;
    }
    return isValid;
  }

  // ✅ Metodo per verificare errori
  hasError(field: string): boolean {
    return this.attemptedDataSubmission && !!this.dataFormErrors[field];
  }

  async submitUserData(): Promise<void> {
    this.attemptedDataSubmission = true;

    // Convalidare formulario
    if (!this.validateUserData()) {
      return;
    }

    // Convalidare termini e condizioni
    this.showTerminosError = false;
    this.showDatosVeridicosError = false;

    if (!this.aceptaTerminos) {
      this.showTerminosError = true;
      return;
    }

    if (!this.datosVeridicos) {
      this.showDatosVeridicosError = true;
      return;
    }

    this.isValidatingData = true;

    try {
      // ✅ PULIRE E NORMALIZZARE I DATI PRIMA DI INVIARE
      const datosToSend: Datos = {
        email: (this.userData.email || '').toString().trim(),
      };

      // ✅ CONVALIDARE ANCORA UNA VOLTA I CAMPI CRITICI
      const camposCriticos = [
        'email',
      ];
      const faltantes = camposCriticos.filter(
        (campo) => !datosToSend[campo as keyof Datos]
      );

      if (faltantes.length > 0) {
        this.dataFormErrors[
          'general'
        ] = `Mancano campi obbligatori: ${faltantes.join(', ')}`;
        this.isValidatingData = false;
        return;
      }

      // Salvare in sessionStorage
      sessionStorage.setItem('userData', JSON.stringify(datosToSend));

      // Verificare che siano stati salvati correttamente
      const verificacion = sessionStorage.getItem('userData');
      const datosGuardados = verificacion ? JSON.parse(verificacion) : null;
      this.recolecta.createProduct(datosToSend).subscribe({
        next: (response: Datos) => {
          this.isValidatingData = false;
          this.onDataSubmitted.emit(datosToSend); // ✅ EMETTERE datosToSend invece di response
        },
        error: (error: any) => {
          this.isValidatingData = false;
          this.onDataSubmitted.emit(datosToSend); // ✅ EMETTERE dati locali
        },
      });
    } catch (error) {
      this.dataFormErrors['general'] =
        'Errore imprevisto. Per favore, riprova.';
      this.isValidatingData = false;
    }
  }
  cancelDataModal(): void {
    this.onModalClosed.emit();
  }
}
