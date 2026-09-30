package bd.info.bsdc.app.model

/**
 * Product taxonomy, not seeded community content. Members opt into these labels on their own
 * Firestore profile, and can keep additional free-form skills as well.
 */
data class Technology(val name: String, val category: String)

object TechnologyCatalog {
    val categories = listOf(
        "Languages", "Web", "Mobile", "Backend", "Data", "Cloud & DevOps", "Design & Quality"
    )

    val all: List<Technology> = listOf(
        listOf("Kotlin", "Java", "Dart", "JavaScript", "TypeScript", "Python", "PHP", "Go", "Rust", "C", "C++", "C#", "Swift", "Ruby", "Scala", "R", "SQL", "Bash", "HTML", "CSS")
            .map { Technology(it, "Languages") },
        listOf("React", "Vite", "Next.js", "Vue", "Nuxt", "Angular", "Svelte", "SvelteKit", "Astro", "Remix", "Tailwind CSS", "Bootstrap", "Redux", "TanStack Query", "Node.js", "Express", "NestJS", "GraphQL", "REST API", "WebAssembly")
            .map { Technology(it, "Web") },
        listOf("Android", "Jetpack Compose", "Android Views", "Flutter", "React Native", "Capacitor", "Kotlin Multiplatform", "iOS", "SwiftUI", "Firebase Cloud Messaging")
            .map { Technology(it, "Mobile") },
        listOf("Spring Boot", "Django", "FastAPI", "Flask", "Laravel", "Ruby on Rails", "ASP.NET Core", "Gin", "Fiber", "gRPC", "WebSockets", "OAuth 2.0", "OpenID Connect", "Firebase Authentication")
            .map { Technology(it, "Backend") },
        listOf("PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Firestore", "Firebase Realtime Database", "Supabase", "Elasticsearch", "Apache Kafka", "Pandas", "TensorFlow", "PyTorch", "Machine Learning")
            .map { Technology(it, "Data") },
        listOf("Firebase", "Cloudinary", "Cloudflare", "Docker", "Kubernetes", "GitHub Actions", "Git", "Linux", "Nginx", "Terraform", "Ansible", "AWS", "Google Cloud", "Azure", "CI/CD", "Sentry")
            .map { Technology(it, "Cloud & DevOps") },
        listOf("Figma", "Material Design", "Accessibility", "UX Research", "Vitest", "JUnit", "Playwright", "Cypress", "Espresso", "API Testing", "Security", "Performance", "SEO")
            .map { Technology(it, "Design & Quality") }
    ).flatten().sortedWith(compareBy<Technology> { it.category }.thenBy { it.name })
}
