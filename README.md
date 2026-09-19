# OpenIA Chat Debug

Chat web local para probar modelos y proveedores compatibles con el endpoint de OpenAI `POST /chat/completions`. La aplicación permite cambiar el proveedor, el identificador del modelo y los parámetros de generación sin tocar el código.

## Funcionalidades

- Conversación multi-turno con contexto completo.
- Respuestas en streaming mediante Server-Sent Events (SSE).
- Razonamiento del modelo visible en un bloque colapsable, también durante el streaming.
- Renderizado Markdown con tablas GFM, enlaces, citas, bloques de código y fórmulas LaTeX mediante KaTeX.
- URL base, clave API y modelo configurables.
- Descubrimiento de modelos mediante `GET /models` y selector desplegable.
- Metadatos avanzados de LM Studio: arquitectura, cuantización, contexto, tamaño, instancias y capacidades.
- Comando local `/list` para actualizar y mostrar los modelos sin añadirlo al contexto enviado.
- Inspector lateral de protocolo con petición JSON, estado, cabeceras y respuesta SSE/JSON cruda.
- Instrucción de sistema, temperatura y límite de tokens configurables.
- Cancelación de una respuesta en curso, limpieza del chat y copia de respuestas.
- Diseño responsive para escritorio y móvil.
- Proxy integrado en Vite: evita exponer la clave API directamente al proveedor desde el navegador y elimina problemas de CORS.
- Persistencia local de los ajustes no sensibles. La clave API **no** se guarda en `localStorage`.

## Requisitos

- Node.js 20 o superior (Node 22 LTS recomendado).
- npm 10 o superior.
- Un endpoint compatible con la API Chat Completions de OpenAI.

## Puesta en marcha

```bash
npm install
npm run dev
```

Abre `http://127.0.0.1:5173` y completa en el panel lateral:

1. **URL base**: por ejemplo, `https://api.openai.com/v1`, `http://localhost:11434/v1` para Ollama o la URL equivalente de tu proveedor.
2. **Clave API**: puede quedar vacía si tu servidor local no exige autenticación.
3. **Modelo**: el identificador exacto que espera el proveedor.
4. Ajusta la instrucción de sistema y los parámetros de generación, y envía un mensaje.

También puedes escribir `/list` en el chat para actualizar la lista. Con LM Studio, la aplicación combina el endpoint compatible `GET /v1/models` con `GET /api/v1/models`, si está disponible, para mostrar información ampliada. Los proveedores que solo implementen el estándar seguirán funcionando, aunque mostrarán menos metadatos.

El botón **Protocolo** abre el inspector lateral. Conserva los últimos diez intercambios y limita cada respuesta cruda a 500 KB. La cabecera de autorización aparece enmascarada y la clave real nunca se muestra en el inspector.

Las respuestas admiten matemáticas en línea con `$E = mc^2$` o `\(...\)`, y fórmulas en bloque con `$$...$$` o `\[...\]`. También se normalizan expresiones habituales de algunos modelos como `((\mathbf{F}_{\text{net}}))` y fórmulas sin delimitadores situadas al final de una línea. El contenido dentro de bloques de código no se modifica.

## Compilar y probar la versión de producción

```bash
npm run build
npm run preview
```

La vista previa se sirve en `http://127.0.0.1:4173`. El plugin de proxy también se activa con `vite preview`.

Para comprobar únicamente los tipos:

```bash
npm run typecheck
```

## Estructura

```text
├── src/
│   ├── components/       Componentes visuales del chat y configuración
│   ├── lib/
│   │   ├── chat.ts       Cliente de Chat Completions y parser SSE
│   │   └── storage.ts    Persistencia segura de preferencias
│   ├── App.tsx           Estado y flujo principal de la aplicación
│   ├── main.tsx          Punto de entrada React
│   ├── styles.css        Sistema visual y diseño responsive
│   └── types.ts          Tipos compartidos
├── vite.config.ts        Servidor Vite y proxy compatible con OpenAI
└── index.html            Documento raíz
```

## Compatibilidad y seguridad

El proxy concatena `/chat/completions` a la URL base. El proveedor debe aceptar el formato clásico de Chat Completions y, si se activa streaming, devolver eventos SSE. El texto se lee de `choices[0].delta.content`; el razonamiento se reconoce en `reasoning_content`, `reasoning`, `thinking`, `reasoning_details` y en bloques `<think>...</think>` incluidos en el contenido.

La clave viaja desde el navegador al servidor Vite local y de ahí al proveedor. No se escribe en disco ni en el almacenamiento del navegador. Esta herramienta está pensada para ejecutarse localmente: el servidor escucha solo en `127.0.0.1`. Si se publica en una red o en Internet, hay que añadir autenticación y restringir las URLs de destino para evitar abusos del proxy.

## Tecnologías

TypeScript, React y Vite. Todo el código de la aplicación y del servidor está escrito en TypeScript.
