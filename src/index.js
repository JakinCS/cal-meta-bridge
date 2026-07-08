async function sha256(text) {
  const data = new TextEncoder().encode(text.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(secret, body, signature) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const computed = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  return computed === signature;
}

export default {
  async fetch(request, env) {
    const rawBody = await request.text();
    const signature = request.headers.get("x-cal-signature-256");

    if (!(await verifySignature(env.CAL_WEBHOOK_SECRET, rawBody, signature))) {
      return new Response("Invalid signature", { status: 401 });
    }

    const booking = JSON.parse(rawBody);
		console.log("Full booking payload:", JSON.stringify(booking.payload));
    const attendee = booking.payload.attendees[0];
    const [firstName, ...rest] = (attendee.name || "").split(" ");
    const lastName = rest.join(" ");
    const phoneDigits = (attendee.phoneNumber || "").replace(/\D/g, "");

    const zarazPayload = {
      events: [{
        client: {
          __zarazTrack: "cal_booking_created",
          em: attendee.email ? await sha256(attendee.email) : "",
          fn: firstName ? await sha256(firstName) : "",
          ln: lastName ? await sha256(lastName) : "",
          ph: phoneDigits ? await sha256(phoneDigits) : "",
					test_event_code: "TEST10075"
        }
      }]
    };

    const zarazResponse = await fetch("https://webchargedsolutions.com/c/c", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(zarazPayload)
    });

		console.log("Zaraz response:", zarazResponse);
		console.log("Zaraz response status:", zarazResponse.status);
		console.log("Payload sent:", JSON.stringify(zarazPayload));

    return new Response("ok");
  }
};