
import re
import pymupdf

from app.config import MAX_PDF_PAGES


OBLIGATION = [
    "shall",
    "must",
    "required",
    "required to",
    "should",
    "to submit",
    "to furnish",
    "to provide",
    "to upload",
]

BIDDER = [
    "bidder",
    "vendor",
    "supplier",
    "tenderer",
    "oem",
]

EVIDENCE = [
    "document",
    "certificate",
    "declaration",
    "undertaking",
    "proof",
    "evidence",
    "authorization",
]

STRONG_PHRASES = {
    "shall submit": 5,
    "shall furnish": 5,
    "shall provide": 5,
    "must submit": 5,
    "required to submit": 5,
    "documentary evidence": 5,
    "eligibility criteria": 8,
    "pre-qualification": 8,
    "mandatory": 4,
}


class TenderPipeline:

    def __init__(self, pdf_path):
        self.pdf_path = pdf_path

        # Intermediate pipeline results
        self.results = []
        self.candidates = []
        self.chunks = []
        self.context = ""

    def make_pattern(self, term):
        """
        Create a case-insensitive regex.

        Whole-word matching is used for single words.
        """
        if " " in term:
            return re.compile(
                re.escape(term),
                re.IGNORECASE
            )

        return re.compile(
            r"\b" + re.escape(term) + r"\b",
            re.IGNORECASE
        )

    def count_matches(self, patterns, text):
        return sum(
            len(pattern.findall(text))
            for pattern in patterns
        )

    def score_pdf_pages(self):
        doc = pymupdf.open(self.pdf_path)
        if len(doc) > MAX_PDF_PAGES:
            doc.close()
            raise ValueError(f"tender PDF exceeds the {MAX_PDF_PAGES}-page limit")

        obligation_patterns = [
            self.make_pattern(term)
            for term in OBLIGATION
        ]

        bidder_patterns = [
            self.make_pattern(term)
            for term in BIDDER
        ]

        evidence_patterns = [
            self.make_pattern(term)
            for term in EVIDENCE
        ]

        strong_patterns = {
            phrase: self.make_pattern(phrase)
            for phrase in STRONG_PHRASES
        }

        results = []

        for page_number, page in enumerate(doc, start=1):

            text = page.get_text(
                "text",
                sort=True
            )

            # --------------------------------
            # Extraction check
            # --------------------------------

            if not text.strip():
                results.append({
                    "page": page_number,
                    "page_score": 0,
                    "extraction_status": "failed",
                    "reason": "no extracted text",
                })
                continue

            # --------------------------------
            # Count signals
            # --------------------------------

            obligation_count = self.count_matches(
                obligation_patterns,
                text
            )

            bidder_count = self.count_matches(
                bidder_patterns,
                text
            )

            evidence_count = self.count_matches(
                evidence_patterns,
                text
            )

            # --------------------------------
            # Strong phrases
            # --------------------------------

            strong_score = 0
            strong_hits = {}

            for phrase, weight in STRONG_PHRASES.items():

                matches = len(
                    strong_patterns[phrase].findall(text)
                )

                if matches > 0:
                    strong_hits[phrase] = matches

                strong_score += matches * weight

            # --------------------------------
            # Main score
            # --------------------------------

            page_score = (
                2 * min(obligation_count, 10)
                + 2 * min(bidder_count, 10)
                + min(evidence_count, 10)
                + strong_score
            )

            results.append({
                "page": page_number,
                "page_score": page_score,
                "extraction_status": "text",
                "obligation_count": obligation_count,
                "bidder_count": bidder_count,
                "evidence_count": evidence_count,
                "strong_score": strong_score,
                "strong_hits": strong_hits,
                "text": text,
            })

        doc.close()

        # Highest scoring pages first
        results.sort(
            key=lambda x: x["page_score"],
            reverse=True
        )

        self.results = results

        return results

    def select_candidate_pages(
        self,
        top_k=15,
        neighbor_radius=1
    ):
        """
        Select high-ranking pages and their neighboring pages.

        Only successfully extracted pages are eligible.
        """

        valid_results = [
            r for r in self.results
            if r["extraction_status"] == "text"
        ]

        top_pages = valid_results[:top_k]

        candidate_numbers = set()

        for result in top_pages:

            page = result["page"]

            for offset in range(
                -neighbor_radius,
                neighbor_radius + 1
            ):
                candidate_numbers.add(page + offset)

        # Keep only pages that actually exist
        max_page = max(
            r["page"]
            for r in self.results
        )

        candidate_numbers = {
            page
            for page in candidate_numbers
            if 1 <= page <= max_page
        }

        self.candidates = sorted(candidate_numbers)

        return self.candidates

    def build_chunks(self, max_gap=1):

        if not self.candidates:
            return []

        pages = sorted(set(self.candidates))

        chunks = []

        start = pages[0]
        previous = pages[0]

        for page in pages[1:]:

            gap = page - previous

            if gap <= max_gap + 1:
                previous = page

            else:
                chunks.append(
                    (start, previous)
                )

                start = page
                previous = page

        chunks.append(
            (start, previous)
        )

        self.chunks = chunks

        return chunks

    def build_llm_context(self):

        """
        Build a concatenated text block from selected
        PDF pages for use as an LLM context.
        """

        page_lookup = {
            r["page"]: r
            for r in self.results
        }

        context_pages = []

        for page_number in sorted(self.candidates):

            result = page_lookup.get(page_number)

            if not result:
                continue

            # Only include pages that actually have text
            if result.get("extraction_status") != "text":
                continue

            context_pages.append(
                f"\n===== PAGE {page_number} =====\n"
                f"{result['text']}"
            )

        self.context = "\n".join(context_pages)

        return self.context

    def prepare(self):
        """
        Run the complete PDF → LLM-context pipeline.
        """

        self.score_pdf_pages()

        self.select_candidate_pages(
            top_k=15,
            neighbor_radius=1
        )

        self.build_chunks(
            max_gap=1
        )

        self.build_llm_context()

        return self.context


if __name__ == "__main__":

    pipeline = TenderPipeline("tender.pdf")

    context = pipeline.prepare()

    print("Context length:", len(context))
    print("Candidate pages:", pipeline.candidates)
    print("Chunks:", pipeline.chunks)

