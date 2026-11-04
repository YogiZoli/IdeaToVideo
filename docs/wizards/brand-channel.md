# YouTube Brand Channel Wizard

Wizards, YouTube Brand Channel Wizard. Prepares a YouTube channel, for the active Identity. Not the Design wizard, which is about the colors and fonts of the videos. DECISIONS 174 has the choices.

Screens, in the shared `WizardShell`: 13 questions, Keywords (optional), Your kit, Preview and save.

| Answer | Goes to |
|---|---|
| who, result, frustration | Identity: Audience |
| feel, person or brand | Identity: Brand Voice |
| topic, result, frustration, proof | Identity: Channel Profile |
| free gift, else course, else website | Identity: Landing page |
| YouTube channel | Identity: YouTube channel |
| language | Identity: Content language |
| everything | `<identity>/traffic-card.md`, the Evergreen Traffic Card version 1 |

Code: `runner/channelwizard/kit.mjs` (questions, kit, fields, card; pure, no AI), `runner/channelwizard/index.mjs` (files), `runner/gates/channel/index.mjs` (the AI's prompts), `app/src/lib/channelwizard/ChannelWizard.svelte` (screens). Answers so far: `<identity>/channel-wizard.json`. Tests: `runner/channel-wizard.test.mjs`. In a browser: `scripts/ui-mock`, `?noai=1` for no AI key; switch to the Identity VoxFlow for a vidIQ key.

It never calls YouTube, never publishes and makes no picture: the texts and the image prompts are there to copy.
