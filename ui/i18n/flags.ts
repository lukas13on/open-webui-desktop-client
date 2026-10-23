import brFlag from 'flag-icons/flags/4x3/br.svg';
import usFlag from 'flag-icons/flags/4x3/us.svg';
import esFlag from 'flag-icons/flags/4x3/es.svg';
import type { Language } from './messages';

// Only the supported flags are bundled; the flag-icons stylesheet would ship every country.
export const LANGUAGE_FLAGS: Record<Language, string> = {
  'pt-BR': brFlag,
  'en-US': usFlag,
  'es-ES': esFlag
};
