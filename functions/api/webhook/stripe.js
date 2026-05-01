export async function onRequestPost(context) {
    const { request, env } = context;
    
    const signatureHeader = request.headers.get('stripe-signature');
    if (!signatureHeader) {
        return new Response('Missing Stripe signature', { status: 400 });
    }

    try {
        const payload = await request.text();
        const secret = env.STRIPE_WEBHOOK_SECRET;

        // 1. Parseamos la firma de seguridad de Stripe
        const elements = signatureHeader.split(',');
        const timestamp = elements.find(e => e.startsWith('t='))?.split('=')[1];
        const signature = elements.find(e => e.startsWith('v1='))?.split('=')[1];

        if (!timestamp || !signature) {
            throw new Error("Formato de firma inválido");
        }

        // 2. Preparamos los datos a comprobar
        const signedPayload = `${timestamp}.${payload}`;
        const encoder = new TextEncoder();

        // 3. Generamos nuestra propia llave con tu secreto usando Cloudflare Crypto (Nativo)
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const expectedSignatureBuffer = await crypto.subtle.sign(
            'HMAC',
            key,
            encoder.encode(signedPayload)
        );

        const expectedSignature = Array.from(new Uint8Array(expectedSignatureBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // 4. Comparamos las firmas para evitar hackers
        if (signature !== expectedSignature) {
            console.error("❌ ¡Firma de Stripe inválida! Intento de hackeo bloqueado.");
            return new Response('Invalid signature', { status: 400 });
        }

        // ========================================================
        // 5. ¡FIRMA VÁLIDA! PROCESAMOS EL PAGO
        // ========================================================
        const event = JSON.parse(payload);

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            
            const customerEmail = session.customer_details?.email;
            const planId = session.client_reference_id; // starter, pro, o max
            
            let creditsToAdd = 0;
            if (planId === 'starter') creditsToAdd = 1000;
            if (planId === 'pro') creditsToAdd = 3000;
            if (planId === 'max') creditsToAdd = 10000;

            console.log(`💰 PAGO RECIBIDO: ${customerEmail} | Plan: ${planId} | Créditos: ${creditsToAdd}`);

            // AQUI CONECTAREMOS CON FIREBASE EN EL SIGUIENTE PASO

            return new Response(JSON.stringify({ status: 'success', credits: creditsToAdd }), { status: 200 });
        }

        return new Response(JSON.stringify({ received: true }), { status: 200 });

    } catch (err) {
        console.error(`❌ Webhook Error: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }
}
