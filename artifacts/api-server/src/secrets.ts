const youtubeCookies = [
  { name: "SID", value: "g.a0008QilDX3Y-Qk_rQd-iQz8kjg_Z-CnUPXwz3J37bqBFZIxKvSTz87PiVEy2w_4JnpwsvaWCwACgYKATYSAQ4SFQHGX2MiCAgN2XTOcrZIoia6Kk_nVRoVAUF8yKr3OjaWHkZ6pIr_ofEtzlPx0076" },
  { name: "APISID", value: "V8xqGyrBRl280b_h/AtKAiffkaq62Y6xmu" },
  { name: "SAPISID", value: "8XT1WCVz6ro90MNA/AoQOJwjP8tvxMewOE" },
  { name: "__Secure-1PAPISID", value: "8XT1WCVz6ro90MNA/AoQOJwjP8tvxMewOE" },
  { name: "__Secure-3PAPISID", value: "8XT1WCVz6ro90MNA/AoQOJwjP8tvxMewOE" },
  { name: "PREF", value: "tz" },
  { name: "SIDCC", value: "AKEyXzVRiiFuVB4snglvUZPlKBEA-gf4qmzVVvYXE-JVOjZYsATWkw3zpa8cIGSiYviPghl0" },
];

export const YOUTUBE_COOKIE_STRING = youtubeCookies.map((c) => `${c.name}=${c.value}`).join("; ");
