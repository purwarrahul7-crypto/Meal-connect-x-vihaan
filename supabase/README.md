# Uploading the daily human menu recording

The menu button looks for a human recording for today's date in India time. It checks `menu-audio/daily/human-YYYY-MM-DD` with `.mp3`, `.m4a`, `.wav`, `.ogg`, or `.webm`. MP3 is recommended for the widest browser support. When today's recording is missing or cannot play, the website reads the current menu with the device's Hindi speech voice.

## Each morning

1. Record the menu and save/export it as MP3.
2. In Supabase Dashboard, open **Storage → menu-audio**. Create a `daily` folder if it does not exist.
3. Upload the recording as `human-YYYY-MM-DD.mp3`, using today's date in `Asia/Kolkata`. For example, on 15 November 2026 upload `daily/human-2026-11-15.mp3`. Replace that same file if you re-record it later.
4. Tap the menu voice button on the website. It will find and play today's recording.

## Allow students to play recordings

The bucket can stay private. Add this read policy once in Supabase **SQL Editor** so visitors can list and download only files in the `daily` folder:

```sql
create policy "Public can read daily menu recordings"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'menu-audio'
  and (storage.foldername(name))[1] = 'daily'
);
```

Upload recordings through the Supabase Dashboard while signed in as a project administrator. Do not add service-role keys or other Supabase secrets to the website.

The website no longer needs OpenAI TTS or a scheduled audio-generation function for this workflow. If you previously set up the `mealconnect-daily-menu-audio` cron job, remove it to avoid generating unused audio and OpenAI charges:

```sql
select cron.unschedule('mealconnect-daily-menu-audio');
```
