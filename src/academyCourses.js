export const ACADEMY_COURSES = [
    {
        id: 'diagnostico-ia',
        stripePriceId: 'price_1TdohxQ4M7vfTU0LkPEDbA01',
        name: 'Diagnóstico IA 1 a 1',
        priceLabel: '6,90€',
        amount: 690,
        duration: '30 minutos',
        format: 'Videollamada por Zoom',
        whatsappSupport: 'Orientación inicial',
        badge: 'Primer paso',
        shortDescription: 'Una sesión rápida para entender tu caso, resolver dudas iniciales y recomendarte el curso o plan que mejor encaja contigo.',
        idealFor: [
            'Personas que no saben por dónde empezar',
            'Autónomos o empresas que quieren orientación',
            'Academias que quieren valorar formación IA',
        ],
        lessons: [
            {
                title: 'Sesión de diagnóstico',
                text: 'Revisamos qué necesitas, qué nivel tienes, qué quieres conseguir y qué formación o servicio te conviene más.',
            },
        ],
        includes: [
            'Videollamada online de 30 minutos',
            'Revisión de tu caso',
            'Recomendación clara del siguiente paso',
            'Si contratas un curso, podemos descontar este importe',
        ],
    },
    {
        id: 'ia-express-1a1',
        stripePriceId: 'price_1TdokqQ4M7vfTU0L0cwq4MPp',
        name: 'Curso IA Express 1 a 1',
        priceLabel: '149€',
        amount: 14900,
        duration: '2 horas',
        format: '1 clase online en directo',
        whatsappSupport: '7 días de soporte por WhatsApp',
        badge: 'Desde cero',
        shortDescription: 'Para empezar con inteligencia artificial sin líos, paso a paso y con ejemplos prácticos para tu día a día.',
        idealFor: [
            'Personas que empiezan desde cero',
            'Autónomos que quieren ahorrar tiempo',
            'Usuarios que quieren aprender ChatGPT, Gemini y herramientas básicas',
        ],
        lessons: [
            {
                title: 'Clase única de 2 horas',
                text: 'Aprendes a usar IA para escribir mejores textos, crear ideas, organizar tareas, preparar documentos y entender qué herramientas te convienen.',
            },
        ],
        includes: [
            'Clase online por Zoom',
            'Explicación paso a paso',
            'Ejercicios prácticos durante la sesión',
            'Acceso a KreateIA Studio',
            '7 días de soporte por WhatsApp',
        ],
    },
    {
        id: 'ia-creador',
        stripePriceId: 'price_1TdomEQ4M7vfTU0Lc8jiVsbp',
        name: 'Curso IA Creador',
        priceLabel: '299€',
        amount: 29900,
        duration: '4 horas',
        format: '3 clases online en directo',
        whatsappSupport: '14 días de soporte por WhatsApp',
        badge: 'Contenido IA',
        shortDescription: 'Aprende a crear textos, imágenes, vídeos, ideas para redes y contenido visual usando IA y KreateIA Studio.',
        idealFor: [
            'Creadores de contenido',
            'Negocios locales',
            'Community managers',
            'Autónomos que quieren mejorar sus redes',
        ],
        lessons: [
            {
                title: 'Clase 1: Bases de IA y prompts claros',
                text: 'Aprendes cómo pedir bien las cosas a la IA, estructurar ideas y evitar resultados genéricos.',
            },
            {
                title: 'Clase 2: Imagen y contenido visual',
                text: 'Aprendes a generar imágenes, mejorar prompts visuales, crear estilos y preparar ideas para redes.',
            },
            {
                title: 'Clase 3: Vídeo, música y flujo de trabajo',
                text: 'Aprendes cómo convertir ideas en vídeos, organizar contenido semanal y crear piezas más atractivas.',
            },
        ],
        includes: [
            '3 clases online en directo',
            '4 horas totales',
            'Acceso a KreateIA Studio',
            'Ejercicios entre clases',
            'Plantillas de prompts',
            '14 días de soporte por WhatsApp',
        ],
    },
    {
        id: 'ia-profesional',
        stripePriceId: 'price_1TdonMQ4M7vfTU0LGjqa3kkQ',
        name: 'Curso IA Profesional',
        priceLabel: '490€',
        amount: 49000,
        duration: '6 horas',
        format: '3 clases online en directo',
        whatsappSupport: '30 días de soporte por WhatsApp',
        badge: 'Negocio y productividad',
        shortDescription: 'Para usar IA en tu trabajo o negocio de forma seria: productividad, contenido, automatizaciones simples y asistentes.',
        idealFor: [
            'Autónomos',
            'Pequeñas empresas',
            'Profesionales que quieren aplicar IA en su trabajo',
            'Negocios que quieren ahorrar tiempo y crear mejores procesos',
        ],
        lessons: [
            {
                title: 'Clase 1: Productividad y trabajo diario con IA',
                text: 'Emails, documentos, ideas, planificación, atención al cliente y tareas repetitivas.',
            },
            {
                title: 'Clase 2: Contenido, imagen, vídeo y comunicación',
                text: 'Creación de publicaciones, campañas, propuestas, imágenes y vídeos con ayuda de IA.',
            },
            {
                title: 'Clase 3: Automatizaciones y sistema de trabajo',
                text: 'Detectamos tareas automatizables y organizamos un sistema práctico para tu negocio.',
            },
        ],
        includes: [
            '3 clases online en directo',
            '6 horas totales',
            'Acceso a KreateIA Studio',
            'Plantillas de trabajo',
            'Ejercicios aplicados a tu caso',
            'Revisión de prompts y procesos',
            '30 días de soporte por WhatsApp',
        ],
    },
];

export function getAcademyCourse(courseId) {
    return ACADEMY_COURSES.find(course => course.id === courseId) || null;
}
