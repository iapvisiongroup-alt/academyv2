import Stripe from 'stripe';

export async function onRequestPost(context) {
    const { request, env } = context;
    
    // 1. Inicializamos Stripe con tu clave secreta de Cloudflare
    const stripe = new Stripe(env.STRIPE_API_KEY, {
        apiVersion: '2023-10-16',
        httpClient: Stripe.createFetchHttpClient(), // Necesario para Cloudflare Workers
    });

    // 2. Capturamos la firma de seguridad que envía Stripe
    const signature = request.headers.get('stripe-signature');
    
    try {
        const body = await request.text();
        
        // 3. Verificamos que el mensaje es 100% real de Stripe y no un impostor
        const event = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            env.STRIPE_WEBHOOK_SECRET
        );

        // 4. Si el evento es un pago completado con éxito...
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            
            // Averiguamos el email del cliente y qué plan compró
            const customerEmail = session.customer_details?.email;
            const planId = session.client_reference_id; // Esto lo mandamos desde el frontend
            
            // Calculamos cuántos créditos tocan
            let creditsToAdd = 0;
            if (planId === 'starter') creditsToAdd = 1000;
            if (planId === 'pro') creditsToAdd = 3000;
            if (planId === 'max') creditsToAdd = 10000;

            console.log(`💰 ¡PAGO RECIBIDO! Usuario: ${customerEmail} | Créditos a sumar: ${creditsToAdd}`);

            // ==========================================
            // AQUÍ CONECTAREMOS CON FIREBASE PARA SUMAR LOS CRÉDITOS
            // (Lo haremos en el siguiente paso para blindar tu base de datos)
            // ==========================================
            
            return new Response(JSON.stringify({ status: 'success', email: customerEmail, credits: creditsToAdd }), { status: 200 });
        }

        // Si es otro tipo de aviso de Stripe, lo ignoramos amablemente
        return new Response(JSON.stringify({ received: true }), { status: 200 });
        
    } catch (err) {
        console.error(`❌ Error en el Webhook: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }
}
