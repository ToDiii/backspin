/**
 * Turns an OAuth failure into something a user can act on.
 *
 * Everyone who wants to use this app runs their own Spotify app in Development
 * Mode, so the failures are nearly always setup mistakes rather than bugs:
 * a Client ID from the wrong app, a Redirect URI that differs by one character,
 * or – by far the most common – an account that was never added to the app's
 * own user list. Spotify reports all of those as a bare error code, so the
 * mapping and the wording live here.
 */

/** Error carrying the code Spotify (or our own callback handling) reported. */
export class SpotifyAuthError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'SpotifyAuthError'
    this.code = code
  }
}

export interface AuthErrorInfo {
  title: string
  /** One or two sentences on what happened. */
  message: string
  /** Concrete things to check, in the order they are worth checking. */
  hints: string[]
  /**
   * Whether a missing entry in the app's user list is a plausible cause. The
   * callback view then offers the direct link into User Management.
   */
  userListLikely: boolean
}

export const USER_MANAGEMENT_URL = 'https://developer.spotify.com/dashboard'

const NOT_IN_USER_LIST =
  'Dein Spotify-Konto steht nicht in der Nutzerliste deiner App. Apps im Development Mode lassen nur eingetragene Konten zu – auch dein eigenes.'

const CHECK_USER_LIST = [
  'Öffne im Dashboard deine App → „Settings" → „User Management" und trage dich dort mit deinem Namen und der E-Mail-Adresse deines Spotify-Kontos ein.',
  'Verwende dieselbe E-Mail-Adresse, mit der du dich bei Spotify anmeldest – nicht irgendeine andere.',
  'Danach die Anmeldung erneut starten.',
]

export const describeAuthError = (
  code: string | null | undefined,
  fallbackMessage?: string | null
): AuthErrorInfo => {
  switch (code) {
    // The step everybody forgets. Spotify reports a refused authorization the
    // same way whether the user cancelled or was never allowed in, so both
    // causes are named – the user list first, because it is the likelier one.
    case 'access_denied':
      return {
        title: 'Spotify hat die Anmeldung abgelehnt',
        message: `Dafür gibt es zwei mögliche Gründe. Der häufigere: ${NOT_IN_USER_LIST} Der andere: Du hast die Freigabe im Spotify-Dialog abgebrochen.`,
        hints: [
          ...CHECK_USER_LIST,
          'Falls du die Freigabe absichtlich abgebrochen hast, starte die Anmeldung einfach neu.',
        ],
        userListLikely: true,
      }

    case 'invalid_client':
      return {
        title: 'Spotify kennt diese Client ID nicht',
        message: 'Die hinterlegte Client ID gehört zu keiner App – oder zu einer anderen, als du denkst.',
        hints: [
          'Kopiere die Client ID im Dashboard erneut aus den Einstellungen genau der App, die du angelegt hast.',
          'Achte darauf, nicht das Client Secret zu erwischen: Beide sind 32 Zeichen lang und sehen gleich aus.',
        ],
        userListLikely: false,
      }

    case 'invalid_grant':
    case 'invalid_request':
      return {
        title: 'Die Anmeldung passt nicht zur App-Konfiguration',
        message: 'Spotify hat den Anmeldevorgang abgelehnt. Meistens weicht die Redirect URI in deiner App von der ab, die diese Seite verwendet.',
        hints: [
          'Die Redirect URI muss exakt übereinstimmen – inklusive http oder https, Portnummer und ohne Schrägstrich am Ende.',
          'Kopiere sie im Setup-Assistenten und füge sie im Dashboard unter „Redirect URIs" ein.',
          'Ein Anmeldevorgang läuft nach wenigen Minuten ab. Wenn du zwischendurch pausiert hast, starte ihn neu.',
        ],
        userListLikely: false,
      }

    case 'profile_forbidden':
      return {
        title: 'Spotify verweigert den Zugriff auf dein Profil',
        message: `Die Anmeldung hat geklappt, aber Spotify liefert keine Daten. ${NOT_IN_USER_LIST}`,
        hints: [
          ...CHECK_USER_LIST,
          'Prüfe außerdem, ob dein Konto Spotify Premium hat: Die Web API setzt das voraus.',
        ],
        userListLikely: true,
      }

    case 'state_mismatch':
      return {
        title: 'Die Anmeldung konnte nicht zugeordnet werden',
        message: 'Der Sicherheitsparameter der Rückmeldung passt nicht zu dieser Sitzung. Das passiert, wenn der Anmeldelink erneut geöffnet oder in einem anderen Tab gestartet wurde.',
        hints: ['Starte die Anmeldung in diesem Tab neu.'],
        userListLikely: false,
      }

    case 'missing_verifier':
      return {
        title: 'Die Anmeldung wurde unterbrochen',
        message: 'Die Daten dieser Sitzung sind nicht mehr da. Das passiert nach einem Neustart des Browsers oder wenn der Tab zwischendurch geschlossen wurde.',
        hints: ['Starte die Anmeldung neu.'],
        userListLikely: false,
      }

    case 'missing_code':
      return {
        title: 'Spotify hat keinen Code geschickt',
        message: 'Die Rückmeldung von Spotify enthielt keinen Autorisierungscode.',
        hints: ['Starte die Anmeldung neu.'],
        userListLikely: false,
      }

    case 'server_error':
    case 'temporarily_unavailable':
      return {
        title: 'Spotify hat gerade ein Problem',
        message: 'Der Fehler liegt bei Spotify, nicht bei deiner Konfiguration.',
        hints: ['Versuch es in ein paar Minuten noch einmal.'],
        userListLikely: false,
      }

    default:
      return {
        title: 'Anmeldung fehlgeschlagen',
        message: fallbackMessage?.trim() || 'Die Anmeldung bei Spotify ist fehlgeschlagen.',
        hints: [
          ...CHECK_USER_LIST.slice(0, 1),
          'Prüfe, ob Client ID und Redirect URI im Dashboard mit denen im Setup-Assistenten übereinstimmen.',
        ],
        userListLikely: true,
      }
  }
}
