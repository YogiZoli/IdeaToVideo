; Uninstall without leftovers: when the user ticks "Delete the application
; data", also remove every API key this app saved in Windows Credential Manager
; (keyring target "default.ideatovideo.<name>", see src/keys.rs ALLOWED).
; Projects in Documents are the user's videos and are never touched.
!macro _ITV_DELETE_KEY NAME
  nsExec::Exec 'cmdkey /delete:default.ideatovideo.${NAME}'
  Pop $0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
    !insertmacro _ITV_DELETE_KEY "gemini"
    !insertmacro _ITV_DELETE_KEY "openrouter"
    !insertmacro _ITV_DELETE_KEY "claude"
    !insertmacro _ITV_DELETE_KEY "openai"
    !insertmacro _ITV_DELETE_KEY "deepseek"
    !insertmacro _ITV_DELETE_KEY "grok"
    !insertmacro _ITV_DELETE_KEY "elevenlabs"
    !insertmacro _ITV_DELETE_KEY "heygen"
    !insertmacro _ITV_DELETE_KEY "vidiq"
  ${EndIf}
!macroend
