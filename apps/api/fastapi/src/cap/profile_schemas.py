import uuid
from typing import Literal

from pydantic import Field, model_validator

from src.cap import ibf
from src.cap.levels import GmsColour
from src.cap.models import CapCategory, CapSeverity
from src.models import BaseModel, UtcDateTime

# The GMS products a profile can template. "Advisory" is kept for the marine
# Small Craft Advisory; see src/cap/levels.py.
ProfileLevel = Literal["Outlook", "Watch", "Warning", "Advisory"]

# The axes of the impact-based forecasting matrix (src/cap/ibf.py).
IbfLikelihood = Literal["Very low", "Low", "Medium", "High"]
IbfImpact = Literal["Minimal", "Minor", "Significant", "Severe"]


class CapProfileRule(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    level: ProfileLevel = "Warning"
    metric: str = Field(default="", max_length=200)
    operator: Literal[">=", ">", "<=", "<", "observed"] = ">="
    threshold: float | None = Field(default=None, allow_inf_nan=False)
    unit: str = Field(default="", max_length=50)
    duration_minutes: int | None = Field(default=None, ge=1)
    area: str = Field(default="", max_length=1000)
    evidence: str = Field(default="", max_length=2000)


class CapProfileImpactLevel(BaseModel):
    """What one impact level looks like for a hazard, and where it starts."""

    impact: IbfImpact
    impacts: list[str] = Field(default_factory=list, max_length=50)
    # Plain-language thresholds, for example "1-hour rainfall > 50 mm".
    thresholds: list[str] = Field(default_factory=list, max_length=20)


class CapProfileColourResponse(BaseModel):
    """What the public should do at one colour; "[...locations...]" marks a gap."""

    colour: GmsColour
    response: str = Field(default="", max_length=10000)


class CapProfileCellText(BaseModel):
    """Wording for one cell of the matrix, replacing the defaults built from the
    impact level and the colour."""

    likelihood: IbfLikelihood
    impact: IbfImpact
    impacts: list[str] = Field(default_factory=list, max_length=50)
    response: str = Field(default="", max_length=10000)


class CapProfileMatrix(BaseModel):
    """A hazard's own likelihood-by-impact grid; absent means the WMO grid."""

    # Rows from "Very low" to "High" likelihood, columns "Minimal" to "Severe" impact.
    cells: list[list[GmsColour]]

    @model_validator(mode="after")
    def usable(self) -> CapProfileMatrix:
        errors = ibf.matrix_errors([[c.value for c in row] for row in self.cells])
        if errors:
            raise ValueError(" ".join(errors))
        return self

    def grid(self) -> list[list[str]]:
        return [[cell.value for cell in row] for row in self.cells]


class CapProfileSubtype(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    name: str = Field(min_length=1, max_length=200)
    categories: list[CapCategory] = Field(
        default_factory=lambda: [CapCategory.MET], min_length=1
    )
    rules: list[CapProfileRule] = Field(default_factory=list, max_length=50)
    impacts: list[str] = Field(default_factory=list, max_length=50)
    responses: list[str] = Field(default_factory=list, max_length=50)
    affected_groups: list[str] = Field(default_factory=list, max_length=50)
    # Impact-based matrix content. A subtype that sets any of these must set all
    # impact levels and all four responses before approval (profiles.approval_errors).
    impact_levels: list[CapProfileImpactLevel] = Field(
        default_factory=list, max_length=4
    )
    colour_responses: list[CapProfileColourResponse] = Field(
        default_factory=list, max_length=4
    )
    cell_texts: list[CapProfileCellText] = Field(default_factory=list, max_length=16)

    @model_validator(mode="after")
    def unique_matrix_entries(self) -> CapProfileSubtype:
        if len({level.impact for level in self.impact_levels}) != len(
            self.impact_levels
        ):
            raise ValueError("Each impact level can be described once")
        if len({r.colour for r in self.colour_responses}) != len(self.colour_responses):
            raise ValueError("Each colour can have one response")
        cells = [(c.likelihood, c.impact) for c in self.cell_texts]
        if len(set(cells)) != len(cells):
            raise ValueError("Each matrix cell can have one wording")
        return self


class CapProfileTemplate(BaseModel):
    level: ProfileLevel
    headline: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=10000)
    instruction: str = Field(default="", max_length=10000)


class CapProfileDefinition(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    family: str = Field(min_length=1, max_length=200)
    subtypes: list[CapProfileSubtype] = Field(min_length=1, max_length=50)
    templates: list[CapProfileTemplate] = Field(default_factory=list, max_length=4)
    issuing_authority: str = Field(default="", max_length=500)
    reviewing_authority: str = Field(default="", max_length=500)
    contact: str = Field(default="meteorology@gaa.gd; 1-473-444-4142", max_length=500)
    channels: list[
        Literal["CAP feed", "Email / EDIS", "WIS2", "GMS website", "Agency channels"]
    ] = Field(default_factory=list)
    notes: str = Field(default="", max_length=5000)
    matrix: CapProfileMatrix | None = None

    @model_validator(mode="after")
    def unique_choices(self) -> CapProfileDefinition:
        names = [s.name.strip().casefold() for s in self.subtypes]
        if not all(names) or len(names) != len(set(names)):
            raise ValueError("Subtype names must be nonempty and unique")
        levels = [t.level for t in self.templates]
        if len(levels) != len(set(levels)):
            raise ValueError("Only one template per message level is allowed")
        return self


class CapProfileSave(BaseModel):
    base_version: int = Field(default=0, ge=0)
    definition: CapProfileDefinition


class CapProfilePublic(BaseModel):
    id: uuid.UUID
    key: str
    version: int
    definition: CapProfileDefinition
    state: Literal["DRAFT", "APPROVED"]
    created_by: uuid.UUID
    created_at: UtcDateTime
    approved_by: uuid.UUID | None
    approved_at: UtcDateTime | None
    approval_errors: list[str]


class CapProfileDraftRequest(BaseModel):
    subtype: str
    level: ProfileLevel
    colour: GmsColour | None = None

    @model_validator(mode="after")
    def colour_matches_product(self) -> CapProfileDraftRequest:
        if self.level == "Outlook" and self.colour is not None:
            raise ValueError("An Outlook has no colour yet")
        if self.level != "Outlook" and self.colour is None:
            raise ValueError(f"Choose a colour for this {self.level}")
        return self


class IbfLevelPublic(BaseModel):
    label: str
    percent: int | None = None


class IbfMatrixPublic(BaseModel):
    """The grid a forecaster reads for one hazard kind."""

    likelihoods: list[IbfLevelPublic]
    impacts: list[IbfLevelPublic]
    cells: list[list[GmsColour]]
    meanings: dict[GmsColour, str]
    # Set when an approved library entry supplied its own grid; otherwise WMO's.
    library_key: str | None = None
    library_version: int | None = None


class IbfSuggestion(BaseModel):
    """The colour and starting wording for one likelihood and impact."""

    colour: GmsColour
    meaning: str
    likelihood: IbfLikelihood
    impact: IbfImpact
    percent: int
    severity: CapSeverity
    awareness_level: str
    # False when no approved library entry exists: only the colour is suggested.
    available: bool
    subtype: str | None = None
    thresholds: list[str] = Field(default_factory=list)
    impacts: list[str] = Field(default_factory=list)
    response: str = ""
    library_key: str | None = None
    library_version: int | None = None
