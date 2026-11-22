import { deathMarkup } from "./death.mjs";
import {
  choiceCost,
  choiceFail,
  choiceRaise,
  choosePath,
  createGame,
  freshSeed,
  openingFigures,
  currentSpace,
  deathProbability,
  gutCheckOdds,
  isEntirety,
  isYearMode,
  portraitStats,
  resolveChoice,
  spin,
  spinPay,
  track,
  triangleRates,
} from "./engine.mjs";

const boardEl = document.querySelector("#board");
const kickerEl = document.querySelector("#kicker");
const titleEl = document.querySelector("#event-title");
const detailEl = document.querySelector("#event-detail");
const reviewCardEl = document.querySelector("#review-card");
const reviewOddsEl = document.querySelector("#review-odds");
const reviewResultEl = document.querySelector("#review-result");
const reviewRuleEl = document.querySelector("#review-rule");
const ageLabelEl = document.querySelector("#age-label");
const choicesEl = document.querySelector("#choices");
const flavorCardEl = document.querySelector("#flavor-card");
const flavorStillEl = document.querySelector("#flavor-still");
const flavorCaptionEl = document.querySelector("#flavor-caption");
const ageEl = document.querySelector("#age");
const savingsEl = document.querySelector("#savings");
const payEl = document.querySelector("#pay");
const expensesEl = document.querySelector("#expenses");
const deathChanceEl = document.querySelector("#death-chance");
const yearsEl = document.querySelector("#years");
const figureEl = document.querySelector("#figure");
const playerEl = document.querySelector("#player-name");
const leverReadout = document.querySelector("#lever-readout");
const minimapEl = document.querySelector("#minimap");
const triangleEl = document.querySelector("#triangle");
const shareSumEl = document.querySelector("#share-sum");
const wedgeNote = document.querySelector("#wedge-note");
const modeNote = document.querySelector("#mode-note");
const retirementEl = document.querySelector("#retirement");
const titleHeading = document.querySelector("#title");
const dekEl = document.querySelector("#dek");
const payLabel = document.querySelector("#pay-label");
const cashLabel = document.querySelector("#cash-label");
const setupLead = document.querySelector("#setup-lead");
const deathEl = document.querySelector("#death");
const deathStage = document.querySelector("#death-stage");
const deathCaption = document.querySelector("#death-caption");
const gameNameInput = document.querySelector("#game-name");
const saveBtn = document.querySelector("#save");
const resumeBtn = document.querySelector("#resume");
const newGameBtn = document.querySelector("#new-game");
const saveNote = document.querySelector("#save-note");
const animEl = document.querySelector("#anim");
const speedEl = document.querySelector("#speed");
const logEl = document.querySelector("#log");
const fineEl = document.querySelector("#fine");
const actBtn = document.querySelector("#act");
const copyBtn = document.querySelector("#copy");
const resumeOpenBtn = document.querySelector("#resume-open");
const readout = document.querySelector("#roll-readout");
const wheel = document.querySelector("#wheel");
const runnerEl = document.querySelector("#runner");
const sceneEl = document.querySelector("#scene");
