export const SUPPORT_EMAIL = "hussammakhoul2733@gmail.com";
export const LEGAL_UPDATED = "October 6, 2026";
export const SUPPORT_SITE = "https://location-wrapped-support.timmygpt2000.chatgpt.site";
export const legal = {
  "privacy": {
    "title": "Privacy policy",
    "sections": [
      [
        "Scope and contact",
        "This policy covers the Location Wrapped native iPhone app and these public support pages. For privacy questions, contact the app developer at hussammakhoul2733@gmail.com. Last updated October 6, 2026."
      ],
      [
        "Location history on your device",
        "The app stores recorded or imported coordinates, timestamps, location accuracy when available, recording-session identifiers, estimated visits, and saved-place names and categories on your device. It processes that history locally to make maps, distance estimates, Insights and Wrapped recaps. Sample data is separate from your real history."
      ],
      [
        "Permissions and your choices",
        "Recording starts when you choose Start background recording and grant the required permissions. Always location access allows recording while the app is in the background; Precise Location improves accuracy. You can pause recording in Profile or change location permissions in iPhone Settings. Demo mode and importing history are available without granting location permission. Switching to demo pauses real recording. iOS, force-quitting, revoked permissions and battery conditions can interrupt updates."
      ],
      [
        "What the developer receives",
        "This release has no developer-operated location upload endpoint, cloud history sync, advertising or developer analytics. Your location history and place names are not automatically sent to the developer. The native app does not require an account. This describes the app’s own handling of history; map services, your chosen sharing destinations and device backups are described separately below."
      ],
      [
        "Map services",
        "The iPhone app uses Apple’s system map service through react-native-maps to display map imagery, route lines and place markers. Map requests can disclose the visible map area and network/device information to Apple; location-enabled map features may also use your current location with permission. The app draws its saved history and place names on the map locally and does not implement a separate history upload service. Apple describes its Maps privacy protections, including rotating usage identifiers that are not linked to your Apple Account, at https://www.apple.com/legal/privacy/data/en/apple-maps/. Map requests are handled under Apple’s privacy policy at https://www.apple.com/legal/privacy/. This map service requires network access for some functions."
      ],
      [
        "Exports and sharing",
        "Export real history as JSON exports your recorded and imported history even when demo mode is displayed. Export sample data as JSON exports only the sample data. Sharing a Wrapped card can reveal place names and patterns. Data leaves the app for the destination you select only when you use these sharing controls; review the contents first. The app attempts to remove its temporary JSON export after the share sheet closes and reports a cleanup failure. Copies saved by other apps, recipients or the operating system are separate."
      ],
      [
        "Retention, deletion and backups",
        "History remains in the app’s local storage until you delete it. Profile → Delete real location data stops recording and removes recorded/imported history and saved-place names from the app, including supported legacy history. It does not delete sample data or copies you previously exported or shared. Device backups may contain app data depending on your settings; manage those copies through your backup provider. Export a backup before removing the app or changing devices. There is no developer-held cloud copy of your location history to restore."
      ],
      [
        "Support email and seven-day retention",
        "If you email hussammakhoul2733@gmail.com, the developer receives your email address, message and any attachments you choose to send. The developer uses this information to answer your support or privacy request and investigate the issue you report, not for marketing. Support messages and their attachments are deleted from the developer’s mailbox and other copies under the developer’s control seven days after each message is sent. You may request earlier deletion at the same address. Do not send raw location history unless you intentionally want to share it. Gmail processes this correspondence under Google’s privacy policy at https://policies.google.com/privacy. Google’s service logs, backup copies and deletion processing follow its own retention policy at https://policies.google.com/technologies/retention; the developer’s seven-day rule does not promise removal from all provider systems within seven days. Copies held by the sender or other recipients are outside the developer’s control."
      ],
      [
        "Public support website",
        "These public pages are hosted through OpenAI Sites with Cloudflare delivery infrastructure. Visiting them sends ordinary web-request information, such as IP address, requested URL, request time and browser/request headers, to the hosting services to deliver and secure the pages. These pages do not request location access, accept history uploads, or include developer-added advertising or analytics scripts. The native app does not send your saved history to this website when you open a policy or support link. Hosting services handle request information under their own policies: https://openai.com/policies/privacy-policy/ and https://www.cloudflare.com/privacypolicy/. Their retention periods are separate from the seven-day support-email rule."
      ],
      [
        "Policy changes",
        "Updates to this policy will be published on this page with a revised date. Changes to app functionality or data handling may also require an app update."
      ]
    ]
  },
  "support": {
    "title": "Support & recording help",
    "sections": [
      [
        "Contact support",
        "Email hussammakhoul2733@gmail.com for help or privacy questions. Include the app version, iPhone model, iOS version and steps to reproduce the issue. Please avoid sending precise locations, screenshots of private places or raw location history unless you choose to share them."
      ],
      [
        "Start with sample or real history",
        "Demo data previews a sample history. Turn Demo data off in Profile to view your own recorded or imported history. Your real local data counts always describe your saved real history, including while demo mode is displayed. No account is required in the native iPhone app."
      ],
      [
        "Record locations",
        "Open Profile and choose Start background recording. Grant location access and Always access when prompted, and enable Precise Location in iPhone Settings. If permissions were previously denied, open Settings → Privacy & Security → Location Services → Location Wrapped. Pause recording in Profile at any time. Force-quitting, revoked permissions and iOS battery management can interrupt updates. Background recording can increase battery use; updates are not guaranteed at an exact interval."
      ],
      [
        "Check recording health",
        "Profile shows the latest received GPS sample, latest saved point and the number of imprecise samples skipped during the session. Fixes with reported accuracy worse than 120 metres are skipped. If no point has been saved recently, check Always and Precise Location permissions and reception, then pause and restart recording if needed. An active status alone does not prove that new locations are arriving."
      ],
      [
        "When a stop becomes a visit",
        "In version 1.1.6 and later, visits require at least two minutes of continuous nearby GPS evidence. Gaps over five minutes are excluded from time spent; gaps over twenty minutes or recording-session changes split visits. Fixes with accuracy worse than 100 metres do not contribute to visits. Places use a smaller, accuracy-aware grouping area, and existing saved places are matched to the nearest anchor within 75 metres. Arrival and departure may be estimated halfway between accurate samples at a transition no more than two minutes apart. Otherwise the first and last observed sample times are shown. Map visit details show the counted duration and excluded gaps. These rules reduce unsupported estimates but cannot recover missing history. The two-minute threshold is not a promise that iOS will deliver enough samples within two minutes. Separate recording sessions are not joined. Nearby venues may be grouped together, and brief pauses can count as visits. A single Capture current location once saves a point; by itself it cannot establish a timed visit."
      ],
      [
        "Identify and rename a place",
        "The Map shows a route line and one pin per saved place. Individual GPS sample pins are hidden. Tap a saved-place pin, or choose an entry in Saved places to center and zoom the map on it. The selected pin turns pink. Check the name and coordinates below the map, then choose Rename place and Save name. Names are reused in Insights, Wrapped, share cards and real-history exports. Demo names cannot be changed. The route displays the latest 200 samples; gaps and disconnected samples are not linked."
      ],
      [
        "View your Wrapped",
        "Open View my Wrapped from the home screen whenever you want. The recap summarizes all recorded/imported history currently available, rather than waiting for a scheduled yearly release. Demo mode shows a sample recap. Distance and visit durations are estimates; missing GPS evidence cannot be reconstructed."
      ],
      [
        "Import GPX or JSON history",
        "Choose Import GPX or JSON history in Profile. Use a timestamped GPX track or a supported Location Wrapped JSON export. Existing history is merged, duplicate records are combined, and conflicting overlapping visits are rejected. Import pauses recording and offers to resume if it was active. Untimed GPX points are skipped. Input limits are 15 MB, 50,000 points, 15,000 visits and 5,000 places per file. Very large exports may need to be split before re-importing; keep the original backup."
      ],
      [
        "Export and delete",
        "Choose Export real history as JSON for your real history, regardless of the displayed mode. Export sample data as JSON is a separate option shown in demo mode. Export before uninstalling or switching devices. Delete real location data removes your real local history and names, stops recording, and leaves previously exported/shared copies at their destinations. Delete those copies separately."
      ],
      [
        "Recover from an error",
        "If storage cannot be opened, the app shows recovery options rather than replacing it with empty history. Try Retry first. If a legacy recovery export is offered, save it before discarding older data. A failed merge does not replace your existing history. If the problem persists, contact support with the error text."
      ]
    ]
  }
} as const;
