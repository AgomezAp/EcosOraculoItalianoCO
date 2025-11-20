import { Injectable } from '@angular/core';
import { cardData } from '../../assets/data';

@Injectable({
  providedIn: 'root',
})
export class CardService {
  private storageKey = 'selectedCards';
  private themeKey = 'selectedTheme'; // ✅ NUEVO: clave para el tema

  getCardsByTheme(theme: string): any[] {
    console.log(`Theme selected: ${theme}`);
    return cardData
      .map((card: any) => {
        if (!card.descriptions[theme]) {
          console.error(
            `El tema "${theme}" no existe en las descripciones de la carta:`,
            card
          );
          return { ...card, descriptions: ['Descripción no disponible'] };
        }
        // Seleccionar una descripción aleatoria de las cuatro disponibles por tema
        const randomDescription =
          card.descriptions[theme][
            Math.floor(Math.random() * card.descriptions[theme].length)
          ];
        return {
          ...card,
          name: card.name,
          descriptions: [randomDescription],
        };
      })
      .sort(() => 0.5 - Math.random());
  }

  // ✅ NUEVO: Método para guardar el tema
  setTheme(theme: string): void {
    localStorage.setItem(this.themeKey, theme);
    console.log('✅ Tema guardado:', theme);
  }

  // ✅ NUEVO: Método para obtener el tema
  getTheme(): string | null {
    const theme = localStorage.getItem(this.themeKey);
    console.log('📖 Tema recuperado:', theme);
    return theme;
  }

  setSelectedCards(cards: any[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(cards));
    console.log('✅ Cartas guardadas:', cards.length);
  }

  getSelectedCards(): any[] {
    const storedCards = localStorage.getItem(this.storageKey);
    const cards = storedCards ? JSON.parse(storedCards) : [];
    console.log('📖 Cartas recuperadas:', cards.length);
    return cards;
  }

  clearSelectedCards(): void {
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.themeKey); // ✅ Limpiar tema también
    console.log('🗑️ Almacenamiento limpiado');
  }
}
