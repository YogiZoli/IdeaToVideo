# IdeaToVideo on a Mac: install and first video

One page, about 15 minutes. You need a Mac with an Apple chip (M1 or newer)
and macOS 11 or newer, and one free key (Google Gemini). Everything else has
a free default.

## 1. Download

Open the Drive link you got and download
`IdeaToVideo_0.1.0_..._aarch64.dmg` (about 100 MB). If Google Drive says it
cannot scan the file for viruses because it is large, click **Download anyway**.

## 2. Install

1. Double-click the `.dmg` file in your Downloads. A window opens.
2. Drag the **IdeaToVideo** icon onto the **Applications** folder in that window.
3. Close the window. In Finder's sidebar, click the eject button next to
   **IdeaToVideo**.

## 3. Open it the first time

The app is not signed by Apple yet, so the Mac blocks it once.

1. Open **Applications** and double-click **IdeaToVideo**. A message says it
   cannot be opened (or that Apple cannot check it). Click **Done** (or **OK**).
2. Open the Apple menu, **System Settings**, **Privacy & Security**.
3. Scroll down. Next to the line about **IdeaToVideo**, click **Open Anyway**.
4. Enter your Mac password if asked, then click **Open Anyway** once more.

You do this only once. Later you start it from Applications or Launchpad.

**If the Mac says "IdeaToVideo is damaged and can't be opened":** the file is
fine, only the download mark confuses macOS. Open **Terminal** (Applications,
Utilities, Terminal), paste this line exactly and press Return:

    xattr -cr /Applications/IdeaToVideo.app

Then open the app again from Applications.

## 4. The one more download

On the first start a bar says **One more download before your first video**.
Click **Download now** (about 280 MB, once). You can carry on while it runs.

## 5. Setup: one free key, the rest skipped

1. **AI key:** keep **Gemini**. Click **Get a key**: Google AI Studio opens.
   Sign in with your Google account, click **Create API key**, copy it.
   Back in the app, paste it and click **Test the key**. It costs nothing.
   The key is stored only in your Mac's keychain, never in a file. If the Mac
   asks whether IdeaToVideo may use the keychain, enter your Mac password and
   click **Always Allow**.
2. Every other step: click **Skip, use default** (or **Use recommended**).
   You can change all of it later in **Settings**.
3. On the last step click **Finish**.

## 6. Your first video

1. Click **New ONE Video**.
2. Type a topic, for example *How to plan a calm week*. Click **Create ONE Video**.
3. Click **Finish on Autopilot** at the top. The app writes the script, the
   YouTube title, summary and tags, makes the voice, plans the scenes and
   renders the video. The title and tags are on the **Script** tab, under
   **Packaging**: change them there and click **Save**.

The render takes about 2 minutes of computer time per minute of video. While
it runs, keep the app open and keep the Mac awake (plugged in, lid open).

## 7. Where your video is

When it is ready, the **Your video** tab plays it. Click **Show in folder**.
All videos are in your **Documents** folder, in **IdeaToVideo Projects**, one
folder per video.

## 8. If something goes wrong

The error box tells you what to do in plain words. If it still does not work,
send us the diagnostics zip: see **How to send us your logs**
(`send-logs.md`, in the same Drive folder).

Thank you for testing!
