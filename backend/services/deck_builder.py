"""Build a branded sales deck from analysis JSON. Product claims stay blank."""

from __future__ import annotations

import logging
from copy import deepcopy
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

logger = logging.getLogger(__name__)

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "assets" / "template.pptx"
SLIDE_W = Inches(13.333333)
SLIDE_H = Inches(7.5)
BODY_COLOR = RGBColor(0x1F, 0x29, 0x33)
MUTED = RGBColor(0x3D, 0x4A, 0x57)
PAPER = RGBColor(0xF6, 0xF4, 0xEF)


def _rgb(value: str) -> RGBColor:
    color = value.strip().lstrip("#")
    if len(color) == 3:
        color = "".join(ch * 2 for ch in color)
    if len(color) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in color):
        raise ValueError(f"Invalid hex color: {value}")
    return RGBColor(int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16))


def _add_text_box(slide, name: str, left, top, width, height):
    shape = slide.shapes.add_textbox(left, top, width, height)
    shape.name = name
    shape.text_frame.word_wrap = True
    shape.text_frame.auto_size = None
    shape.text_frame.vertical_anchor = MSO_ANCHOR.TOP
    shape.line.fill.background()
    return shape


def _set_background(slide, color: RGBColor) -> None:
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def _paint(shape, color: RGBColor) -> None:
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def create_template(path: Path = TEMPLATE_PATH) -> Path:
    """Write the 6-slide template with named shapes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    presentation = Presentation()
    presentation.slide_width = SLIDE_W
    presentation.slide_height = SLIDE_H
    blank = presentation.slide_layouts[6]
    for _ in range(6):
        slide = presentation.slides.add_slide(blank)
        _set_background(slide, PAPER)
        accent = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(0.12), SLIDE_H)
        accent.name = "accent_bar"
        _paint(accent, RGBColor(0x14, 0x32, 0x4A))
        _add_text_box(slide, "title_text", Inches(0.55), Inches(0.28), Inches(10.4), Inches(0.78))
        _add_text_box(slide, "tag_text", Inches(0.55), Inches(1.08), Inches(8.5), Inches(0.32))
        divider = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE, Inches(0.55), Inches(1.46), Inches(2.3), Inches(0.06)
        )
        divider.name = "divider"
        _paint(divider, RGBColor(0xC4, 0x6B, 0x3A))
        _add_text_box(slide, "body_text", Inches(0.55), Inches(1.7), Inches(12.1), Inches(3.85))
        _add_text_box(slide, "quote_text", Inches(0.55), Inches(5.7), Inches(12.1), Inches(1.4))
    presentation.save(path)
    return path


def _shape_by_name(slide, name: str):
    for shape in slide.shapes:
        if shape.name == name:
            return shape
    raise KeyError(name)


def _write(shape, text: str, color: RGBColor, size: int, bold: bool = False, italic: bool = False) -> None:
    frame = shape.text_frame
    frame.word_wrap = True
    frame.auto_size = None
    lines = (text or "").split("\n") or [""]
    first = frame.paragraphs[0]
    first.clear()
    _fill_paragraph(first, lines[0], color, size, bold, italic)
    extras = list(frame.paragraphs)[1:]
    for extra in extras:
        extra._p.getparent().remove(extra._p)
    for line in lines[1:]:
        paragraph = frame.add_paragraph()
        _fill_paragraph(paragraph, line, color, size, bold, italic)


def _fill_paragraph(paragraph, text: str, color: RGBColor, size: int, bold: bool, italic: bool) -> None:
    paragraph.alignment = PP_ALIGN.LEFT
    paragraph.space_after = Pt(6)
    run = paragraph.add_run()
    run.text = text
    run.font.name = "Calibri"
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color


def _duplicate_slide(presentation: Presentation, index: int):
    source = presentation.slides[index]
    destination = presentation.slides.add_slide(source.slide_layout)
    for shape in list(destination.shapes):
        element = shape._element
        element.getparent().remove(element)
    for shape in source.shapes:
        destination.shapes._spTree.append(deepcopy(shape._element))
    return destination


def _delete_slide(presentation: Presentation, index: int) -> None:
    slide_id = presentation.slides._sldIdLst[index]
    presentation.part.drop_rel(slide_id.get(qn("r:id")))
    presentation.slides._sldIdLst.remove(slide_id)


def _reorder(presentation: Presentation, order: list[int]) -> None:
    xml_slides = presentation.slides._sldIdLst
    existing = list(xml_slides)
    for child in list(xml_slides):
        xml_slides.remove(child)
    for index in order:
        xml_slides.append(existing[index])


def _prepare_pain_slides(presentation: Presentation, count: int) -> None:
    if count <= 0:
        _delete_slide(presentation, 2)
        return
    if count == 1:
        return
    for _ in range(count - 1):
        _duplicate_slide(presentation, 2)
    total = len(presentation.slides)
    extras = list(range(6, total))
    _reorder(presentation, [0, 1, 2, *extras, 3, 4, 5])


def _company_label(analysis: dict, fallback: str | None) -> str:
    name = (analysis.get("company_name") or fallback or "").strip()
    return name or "the customer"


def _add_logo(slide, logo_path: Path) -> None:
    from PIL import Image

    with Image.open(logo_path) as image:
        width_px, height_px = image.size
    if width_px <= 0 or height_px <= 0:
        return
    aspect = width_px / height_px
    height = Inches(1.5)
    width = Emu(int(height * aspect))
    max_width = Inches(3.2)
    if width > max_width:
        width = max_width
        height = Emu(int(width / aspect))
    left = SLIDE_W - width - Inches(0.4)
    slide.shapes.add_picture(str(logo_path), left, Inches(0.28), width=width, height=height)


def _apply_brand(slide, primary: RGBColor, secondary: RGBColor) -> None:
    accent = _shape_by_name(slide, "accent_bar")
    divider = _shape_by_name(slide, "divider")
    _paint(accent, primary)
    _paint(divider, secondary)


def _fill_common(slide, title: str, tag: str, body: str, quote: str, primary: RGBColor, secondary: RGBColor) -> None:
    _apply_brand(slide, primary, secondary)
    _write(_shape_by_name(slide, "title_text"), title, primary, 30, bold=True)
    _write(_shape_by_name(slide, "tag_text"), tag, secondary, 13, bold=True)
    _write(_shape_by_name(slide, "body_text"), body, BODY_COLOR, 18)
    _write(_shape_by_name(slide, "quote_text"), quote, MUTED, 15, italic=bool(quote))


def build_deck(
    analysis: dict,
    enrichment: dict,
    output_path: Path,
    *,
    salesperson_name: str,
    company_name: str | None,
    brand_color_primary: str,
    brand_color_secondary: str,
    logo_path: Path | None,
    template_path: Path = TEMPLATE_PATH,
) -> None:
    if not template_path.exists():
        create_template(template_path)
    primary = _rgb(brand_color_primary)
    secondary = _rgb(brand_color_secondary)
    company = _company_label(analysis, company_name)
    pains = list(analysis.get("pain_points") or [])[:4]
    news = (enrichment or {}).get("recent_news_snippet")
    news_line = f"Recently: {news}" if news else ""

    presentation = Presentation(str(template_path))
    if len(presentation.slides) != 6:
        raise RuntimeError("Deck template does not contain the 6 base slides")
    _prepare_pain_slides(presentation, len(pains))

    title_slide = presentation.slides[0]
    summary_slide = presentation.slides[1]
    if pains:
        pain_slides = [presentation.slides[2 + index] for index in range(len(pains))]
        solution_slide = presentation.slides[2 + len(pains)]
        value_slide = presentation.slides[3 + len(pains)]
        next_slide = presentation.slides[4 + len(pains)]
    else:
        pain_slides = []
        solution_slide = presentation.slides[2]
        value_slide = presentation.slides[3]
        next_slide = presentation.slides[4]

    _fill_common(
        title_slide,
        f"{company} opportunity brief",
        "PREPARED FROM THE SALES CALL",
        f"Prepared by {salesperson_name or 'the account team'}\nA customer-specific leave-behind. Solution lines are intentionally blank.",
        news_line,
        primary,
        secondary,
    )
    signals = analysis.get("buying_signals") or {}
    budget = signals.get("budget_detail") if signals.get("budget_mentioned") else "Not mentioned"
    timeline = signals.get("timeline_mentioned") or "Not mentioned"
    decision = "Yes" if signals.get("decision_maker_present") else "Not confirmed"
    summary_body = "\n".join(
        [
            analysis.get("call_summary") or "",
            "",
            f"Industry: {analysis.get('industry_guess') or 'Not discussed'}",
            f"Budget: {budget or 'Not mentioned'}",
            f"Timeline: {timeline}",
            f"Decision maker on the call: {decision}",
        ]
    )
    _fill_common(
        summary_slide,
        "What we heard",
        "CALL SUMMARY",
        summary_body.strip(),
        news_line if news_line else "",
        primary,
        secondary,
    )

    for slide, point in zip(pain_slides, pains):
        _fill_common(
            slide,
            point.get("title") or "Pain point",
            f"{str(point.get('category', 'other')).upper()}  ·  {str(point.get('severity', 'medium')).upper()}",
            point.get("description") or "",
            f"“{point.get('quote', '').strip()}”",
            primary,
            secondary,
        )

    solution_lines = [
        "Each problem below is paired with a blank line. Fill in how you solve it. Do not invent a product claim.",
    ]
    if not pains:
        solution_lines.append("")
        solution_lines.append("No customer pain points were extracted from this recording.")
        solution_lines.append("How we solve it: ______________________________")
    for index, point in enumerate(pains, start=1):
        solution_lines.append("")
        solution_lines.append(f"{index}. {point.get('title')}")
        solution_lines.append("How we solve it: ______________________________")
    _fill_common(
        solution_slide,
        "Solution mapping",
        "SALESPERSON TO COMPLETE",
        "\n".join(solution_lines),
        "",
        primary,
        secondary,
    )

    angle = analysis.get("recommended_solution_angle") or "Confirm the angle with the customer before proposing anything."
    high_count = sum(1 for point in pains if point.get("severity") == "high")
    value_body = "\n".join(
        [
            f"Suggested conversation angle: {angle}",
            "",
            f"Pain points in this deck: {len(pains)} ({high_count} high severity).",
            "Customer impact to confirm: ______________________________",
            "ROI hypothesis (salesperson to complete): ______________________________",
            "Proof point to attach: ______________________________",
        ]
    )
    _fill_common(
        value_slide,
        "Value and ROI",
        "WORKING HYPOTHESIS",
        value_body,
        "Numbers on this slide are for the salesperson to complete after the call.",
        primary,
        secondary,
    )

    steps = [step for step in (analysis.get("next_steps") or []) if str(step).strip()]
    step_lines = [f"{index}. {step}" for index, step in enumerate(steps, start=1)] or [
        "1. Agree the next meeting and the owner for each open question."
    ]
    objection_lines = []
    for item in analysis.get("objections") or []:
        handled = "addressed on the call" if item.get("handled_on_call") else "still open"
        objection_lines.append(f"- {item.get('objection')} ({handled})")
    next_body = "\n".join(step_lines)
    if objection_lines:
        next_body += "\n\nObjections\n" + "\n".join(objection_lines)
    _fill_common(
        next_slide,
        "Next steps",
        "AGREED FOLLOW-UP",
        next_body,
        "",
        primary,
        secondary,
    )

    if logo_path and Path(logo_path).exists():
        try:
            _add_logo(title_slide, Path(logo_path))
        except Exception:
            logger.warning("Logo could not be placed on the title slide", exc_info=True)

    presentation.core_properties.title = f"{company} opportunity brief"
    presentation.core_properties.author = salesperson_name or ""
    presentation.core_properties.subject = "Demo to Deck sales leave-behind"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    presentation.save(str(output_path))
