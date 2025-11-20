import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'benvenuto',
    pathMatch: 'full',
  },
  {
    path: 'benvenuto',
    loadComponent: () =>
      import('./components/bienvenida/bienvenida.component').then(
        (m) => m.BienvenidaComponent
      ),
  },
  {
    path: 'significato-sogni',
    loadComponent: () =>
      import(
        './components/significado-suenos/significado-suenos.component'
      ).then((m) => m.SignificadoSuenosComponent),
  },
  {
    path: 'informazione-zodiaco',
    loadComponent: () =>
      import(
        './components/informacion-zodiaco/informacion-zodiaco.component'
      ).then((m) => m.InformacionZodiacoComponent),
  },
  {
    path: 'lettura-numerologia',
    loadComponent: () =>
      import(
        './components/lectura-numerologia/lectura-numerologia.component'
      ).then((m) => m.LecturaNumerologiaComponent),
  },
  {
    path: 'mappa-vocazionale',
    loadComponent: () =>
      import('./components/mapa-vocacional/mapa-vocacional.component').then(
        (m) => m.MapaVocacionalComponent
      ),
  },
  {
    path: 'animale-interiore',
    loadComponent: () =>
      import('./components/animal-interior/animal-interior.component').then(
        (m) => m.AnimalInteriorComponent
      ),
  },
  {
    path: 'tabella-nascita',
    loadComponent: () =>
      import('./components/tabla-nacimiento/tabla-nacimiento.component').then(
        (m) => m.TablaNacimientoComponent
      ),
  },
  {
    path: 'oroscopo',
    loadComponent: () =>
      import('./components/zodiaco-chino/zodiaco-chino.component').then(
        (m) => m.ZodiacoChinoComponent
      ),
  },
  {
    path: 'calcolatrice-amore',
    loadComponent: () =>
      import('./components/calculadora-amor/calculadora-amor.component').then(
        (m) => m.CalculadoraAmorComponent
      ),
  },
  {
    path: 'particelle',
    loadComponent: () =>
      import('./shared/particles/particles.component').then(
        (m) => m.ParticlesComponent
      ),
  },
  {
    path: 'termini-condizioni-ecos',
    loadComponent: () =>
      import(
        './components/terminos-condiciones/terminos-condiciones.component'
      ).then((m) => m.TerminosCondicionesEcos),
  },
  {
    path: 'politiche-cookie',
    loadComponent: () =>
      import('./components/cookies/cookies.component').then(
        (m) => m.CookiesComponent
      ),
  },
];
