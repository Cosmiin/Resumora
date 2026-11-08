import { describe, expect, it } from "vitest";
import { detectAdLanguage } from "./language.ts";

describe("detectAdLanguage", () => {
  it("finds each of the six languages from common words", () => {
    expect(detectAdLanguage("We are looking for an engineer who will build the tools and work with our team in the office.")).toBe("en");
    expect(detectAdLanguage("Căutăm un inginer care să construiască instrumente și să lucreze cu echipa noastră pentru clienți.")).toBe("ro");
    expect(detectAdLanguage("Nous cherchons un ingénieur pour construire des outils avec notre équipe et les clients dans le bureau.")).toBe("fr");
    expect(detectAdLanguage("Wir suchen einen Ingenieur, der mit dem Team und für die Kunden das Werkzeug baut, und ist bei uns.")).toBe("de");
    expect(detectAdLanguage("Buscamos un ingeniero para construir las herramientas con el equipo y los clientes de la oficina.")).toBe("es");
    expect(detectAdLanguage("Cerchiamo un ingegnere per costruire gli strumenti con il nostro team e per i clienti della sede.")).toBe("it");
  });

  it("returns null for a language outside the six", () => {
    expect(detectAdLanguage("Wij zoeken een ontwikkelaar die met ons team werkt aan nieuwe producten voor onze klanten.")).toBeNull();
  });

  it("returns null when there are too few hits or no clear leader", () => {
    expect(detectAdLanguage("SQL, Python, AWS")).toBeNull();
    expect(detectAdLanguage("the and with for the y el los las del")).toBeNull();
  });
});
