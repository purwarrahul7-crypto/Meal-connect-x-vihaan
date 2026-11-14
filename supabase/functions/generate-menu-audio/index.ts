import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function indiaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const date = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${date.year}-${date.month}-${date.day}`
}

function menuAnnouncement(meals: Array<{ name: string; price: number; description?: string; available_quantity?: number | null }>) {
  const available = meals.filter((meal) => meal.available_quantity !== 0)
  if (!available.length) {
    return "नमस्ते! आज का मेन्यू अभी तैयार नहीं है। कृपया थोड़ी देर बाद फिर से आएँ। धन्यवाद!"
  }

  const items = available.map((meal, index) => {
    const stock = meal.available_quantity == null
      ? ""
      : meal.available_quantity === 1
        ? ", बस एक टिफ़िन बाकी है"
        : `, अभी ${meal.available_quantity} टिफ़िन उपलब्ध हैं`
    const leadIn = index === 0 ? "आज सबसे पहले है" : "इसके बाद है"
    return `${leadIn} ${meal.name}, ${meal.price} रुपये का${stock}.`
  })

  return [
    "अरे भैया, नमस्ते! MealConnect पर आज का मेन्यू सुन लीजिए।",
    ...items,
    "अब pickup की बात। टिफ़िन दोपहर एक बजे मिलेगा।",
    "Gate number two चुना है तो Gate number two पर मिलेगा, और Gate number one चुना है तो Gate number one पर।",
    "जो पसंद आए, उसका ऑर्डर सुबह दस बजे से पहले कर देना। फिर अपना टिफ़िन चुने हुए गेट से ले लेना।",
  ].join(" ")
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const cronSecret = Deno.env.get("MENU_AUDIO_CRON_SECRET")
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "Unauthorized" }, 401)
  }

  const openAiKey = Deno.env.get("OPENAI_API_KEY")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const secretKeyMap = Deno.env.get("SUPABASE_SECRET_KEYS")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    (secretKeyMap ? JSON.parse(secretKeyMap).default : undefined)

  if (!openAiKey || !supabaseUrl || !serviceKey) {
    return json({ error: "Set OPENAI_API_KEY and configure the Supabase function secrets." }, 500)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: college, error: collegeError } = await admin
    .from("colleges")
    .select("id")
    .eq("is_active", true)
    .ilike("name", "%GL Bajaj%")
    .limit(1)
    .maybeSingle()
  if (collegeError) return json({ error: collegeError.message }, 500)
  if (!college?.id) return json({ error: "No active GL Bajaj college was found." }, 404)

  const { data: meals, error: mealsError } = await admin
    .from("meals")
    .select("name,description,price,available_quantity")
    .eq("college_id", college.id)
    .eq("is_available", true)
    .order("created_at", { ascending: true })
  if (mealsError) return json({ error: mealsError.message }, 500)

  const input = menuAnnouncement(meals ?? [])
  if (input.length >= 3800) {
    return json({ error: "Today's menu is too long for one voice recording. Shorten the menu descriptions or split the announcement." }, 422)
  }
  const speechResponse = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "marin",
      input,
      instructions: "Make this sound like a real, friendly bhaiya recording a casual Hindi-Hinglish voice note for students. Say it warmly and naturally, as if telling someone today's menu in person. Use everyday Indian Hindi with relaxed Hinglish pronunciation for 'menu', 'pickup', and 'Gate number'. Let the pitch and emphasis vary gently; use small natural pauses between dishes, prices, and pickup details. Keep it clear and conversational, with no formal announcer rhythm or exaggerated sales excitement. Read all menu facts exactly as written and do not add extra words.",
      response_format: "mp3",
    }),
  })

  if (!speechResponse.ok) {
    const details = await speechResponse.text()
    console.error("OpenAI TTS request failed:", speechResponse.status, details)
    return json({ error: "The speech provider could not generate today's audio." }, 502)
  }

  const audio = await speechResponse.arrayBuffer()
  const path = `daily/${indiaDate()}.mp3`
  const { error: uploadError } = await admin.storage
    .from("menu-audio")
    .upload(path, audio, { contentType: "audio/mpeg", upsert: true, cacheControl: "3600" })
  if (uploadError) return json({ error: uploadError.message }, 500)

  return json({ ok: true, path, mealCount: meals?.length ?? 0 })
})
