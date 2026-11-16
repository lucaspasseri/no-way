'use client';

import { useI18n } from "@/i18n/LocalizationProvider";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Layers, RefreshCw, Shuffle, Sliders, Star, Zap } from 'react-feather';
import { defaultLabConfig, labConfigSchema, labChunkSize, topicLabel } from '@/features/lab/config.mjs';
import { labRequest } from '@/features/lab/client.mjs';
import { cooldownActive, cooldownUntil } from '@/features/lab/diagnostics.mjs';
import { useGameSessions } from '@/features/game/GameSessions';
import GameSettings from '../GameSettings';
import styles from './QuestionLab.module.css';
import LabErrorResult, { ModelRouting } from './LabErrorResult';
const levels = {
  any: 'Any audience',
  kindergarten: 'Kindergarten',
  elementary: 'Elementary school',
  'high-school': 'High school',
  college: 'College',
  expert: 'PhD / Expert',
  custom: 'My own challenge'
};
const ideas = ['Pokémon', 'Space exploration', 'Ancient civilizations', 'Brazilian football'];
function PackArt({
  active = false,
  topic = 'A little curiosity',
  count = 10,
  accepted = 0
}) {
  const {
    t
  } = useI18n();
  return <div className={`${styles.packArt} ${active ? styles.active : ''}`} aria-hidden='true'>
    <span className={styles.orbitOne}>✦</span><span className={styles.orbitTwo}>+</span><span className={styles.orbitThree}>✳</span>
    <div className={styles.artGrid} />
    <div className={styles.cardBack} /><div className={styles.cardMiddle} />
    <div className={styles.artCard}><div className={styles.artCardTop}><span>NO WAY</span><span>LAB / 01</span></div>
      <div className={styles.questionMark}>?</div><div className={styles.artRule} /><p>{t(topic)}</p>
      <span className={styles.artFoot}>{active ? t('{count} accepted so far', { count: accepted }) : t('{count} possibilities to explore', { count })}<Star size={14} /></span>
    </div>
    <span className={styles.artTag}><Zap size={13} />{active ? t("Curiosity in motion") : t("Made for your next “no way!”")}</span>
  </div>;
}
export default function QuestionLab({
  categories,
  unavailable = false
}) {
  const {
    t, locale, unitSystem,
    metadataLabel
  } = useI18n();
  const sessions = useGameSessions();
  const [config, setConfig] = useState(() => sessions?.get('labConfig') ?? {
    ...defaultLabConfig
  });
  const [pack, setPack] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestDetails, setRequestDetails] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [activity, setActivity] = useState('Preparing your private pack');
  const [restoring, setRestoring] = useState(true);
  const controller = useRef(null);
  const restoreController = useRef(null);
  const running = useRef(false);
  const titleRef = useRef(null);
  const returnHref = sessions?.get('lastGame') ?? '/';
  const details = requestDetails ?? pack?.errorDetails;
  const blocked = cooldownActive(details, now);
  const retryAt = cooldownUntil(details);
  useEffect(() => {
    if (!retryAt) return;
    const refresh = () => setNow(Date.now());
    const tick = setInterval(refresh, 30000);
    const expiry = setTimeout(refresh, Math.min(2147483647, Math.max(0, retryAt - Date.now() + 50)));
    return () => { clearInterval(tick); clearTimeout(expiry); };
  }, [retryAt]);
  useEffect(() => {
    const abort = new AbortController();
    restoreController.current = abort;
    async function restore() {
      try {
        const id = sessionStorage.getItem('no-way:lab-pack');
        if (!id) return;
        const response = await fetch('/api/question-lab?id=' + encodeURIComponent(id), {
          signal: abort.signal,
          cache: 'no-store'
        });
        if (response.ok) {
          const payload = await response.json();
          setPack(payload.pack);
          setConfig(payload.pack.config);
        } else sessionStorage.removeItem('no-way:lab-pack');
      } catch {/* Configuration remains usable when storage or the network is unavailable. */} finally {
        if (!abort.signal.aborted) {
          setRestoring(false);
          setBusy(false);
        }
      }
    }
    restore();
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, []);
  function update(patch) {
    setConfig(previous => {
      const next = {
        ...previous,
        ...patch
      };
      sessions?.set('labConfig', next);
      return next;
    });
    setError('');
  }
  function remember(next) {
    setPack(next);
    try {
      sessionStorage.setItem('no-way:lab-pack', next.id);
    } catch {/* In-memory play still works. */}
  }
  async function generate(resume = false) {
    if (running.current || cooldownActive(details)) return;
    restoreController.current?.abort();
    setRestoring(false);
    const parsed = labConfigSchema.safeParse({ ...config, locale, unitSystem });
    if (!parsed.success) {
      setError('Check the pack size, topic, and knowledge level.');
      return;
    }
    running.current = true;
    setBusy(true);
    setError('');
    setRequestDetails(null);
    setDismissed(false);
    const abort = new AbortController();
    controller.current = abort;
    let created = false;
    try {
      setActivity('Preparing your private pack');
      let next = pack;
      if (!resume) {
        setPack(null);
        // Remember the id before submitting, so an interrupted create is recoverable.
        const id = crypto.randomUUID();
        try {
          sessionStorage.setItem('no-way:lab-pack', id);
        } catch {/* Optional recovery. */}
        next = (await labRequest({
          action: 'create',
          id,
          config: parsed.data
        }, abort.signal)).pack;
        remember(next);
        created = true;
      } else {
        const response = await fetch('/api/question-lab?id=' + encodeURIComponent(pack.id), {
          signal: abort.signal,
          cache: 'no-store'
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        next = payload.pack;
        remember(next);
      }
      while (next.status === 'generating') {
        setActivity('Generating questions & screening this batch');
        next = (await labRequest({
          action: 'advance',
          id: next.id,
          attempt: next.attempts
        }, abort.signal)).pack;
        remember(next);
        if (next.lastError) {
          setError(next.lastError);
          break;
        }
      }
      if (!abort.signal.aborted) titleRef.current?.focus();
    } catch (failure) {
      if (!resume && !created && pack && failure.status) remember(pack);
      if (failure.pack) remember(failure.pack);
      if (failure.details) setRequestDetails(failure.details);
      if (!abort.signal.aborted) setError(failure.name === 'TimeoutError' ? t("This batch is taking longer than expected. Your pack is saved; resume to check it.") : failure.message || t("Generation was interrupted. Try again."));
    } finally {
      if (!abort.signal.aborted) setBusy(false);
      running.current = false;
    }
  }
  async function keepPartial() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setDismissed(true);
    try {
      remember((await labRequest({
        action: 'finish',
        id: pack.id
      })).pack);
    } catch (failure) {
      setError(failure.message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function edit() {
    restoreController.current?.abort();
    setRestoring(false);
    setPack(null);
    setError('');
    // Retain a known account cooldown while the player edits configuration.
    setRequestDetails(details?.rateLimit?.accountWide ? details : null);
    setDismissed(false);
    try {
      sessionStorage.removeItem('no-way:lab-pack');
    } catch {/* Optional recovery. */}
  }
  const generating = busy || pack?.status === 'generating';
  const completed = pack && !generating;
  const generationError = error || pack?.lastError;
  const valid = labConfigSchema.safeParse({ ...config, locale, unitSystem }).success;
  return <main className={styles.lab}>
    <nav className={styles.nav} aria-label={t("Lab navigation")}><Link href={returnHref}><ArrowLeft size={16} />{t("Back to game")}</Link><span>NO WAY <span className={styles.navSlash}>/</span> {t("EXPERIMENTS")}</span><GameSettings canReset={false} onResetGuesses={() => {}} /></nav>
    <header className={styles.hero}>
      <div><span className={styles.eyebrow}><span className={styles.dot} />{t("A LITTLE CURIOSITY. A LOT OF POSSIBILITIES.")}</span>
        <h1>{locale === 'pt-BR' ? t("Lab") : t("AI Question")} <span>{locale === 'pt-BR' ? t("AI Question") : t("Lab")}<span className={styles.spark}>✳</span></span></h1>
        <p>{t("Your topic. Your level. A whole new reason to say")} <em>{t("“no way.”")}</em><br />{t("Cook up a pack of numerical trivia and see where it takes you.")}</p>
      </div><div className={styles.experimental}><Zap size={15} /><span>{t("Experimental")}<br /><small>{t("Fresh from the imagination")}</small></span></div>
    </header>

    {pack && <p role='status'>{t('This pack keeps its original language and measurements. New preferences apply to new packs.')} · {pack.config.locale ?? 'en'} · {t(pack.config.unitSystem === 'metric' ? 'Metric' : 'Original units')}</p>}
    <div className={styles.notice}><span aria-hidden='true'>✳</span><p><strong>{t("Curiosity welcome. A little skepticism, too.")}</strong> {t("AI can get facts wrong. Packs are generated and structurally screened, but their answers are not independently verified. Just for casual play.")}</p></div>
    {unavailable && <p role='alert' className={styles.error}>{t("The question database is unavailable. Please try again later.")}</p>}
    {details && !busy && !dismissed && <LabErrorResult details={details} pack={pack} now={now}
      onRetry={() => generate(pack?.status === 'generating')} onSettings={edit}
      onKeep={keepPartial} onDismiss={() => setDismissed(true)} />}

    {details && !busy && !dismissed && pack?.status === 'generating' ? null : generating ? <section className={`${styles.generating} ${details && !busy ? styles.paused : ''}`} aria-busy={busy}>
      {(!details || busy) && <PackArt active={busy} topic={t(topicLabel(pack?.config ?? config, locale))} count={config.count} accepted={pack?.accepted ?? 0} />}
      <div className={styles.generationCopy}><span className={styles.eyebrow}>{t("EXPERIMENT IN PROGRESS")}</span>
        <h2 tabIndex={-1} ref={titleRef}>{busy ? t("A good question takes a little curiosity.") : t("Your experiment is saved.")}</h2>
        <p>{busy ? t("Connecting the dots, finding the numbers, and keeping the interesting bits.") : t("Resume your saved pack, or play with the questions already accepted.")}</p>
        <div className={styles.counter} role='status' aria-live='polite'><strong key={pack?.accepted} className='number-pulse'>{pack?.accepted ?? 0}<span> / {pack?.config.count ?? config.count}</span></strong><span>{t("questions passed structural screening")}</span></div>
        <div className={styles.stage}><span className={busy ? styles.liveDot : styles.dot} /><span>{busy ? t(activity) : t("Paused · no requests running in this tab")}</span></div>
        {busy && pack && <p className={styles.fine} role='status'>{t('Requesting batch {batch} of {total} · attempt {attempt} of {maximum}', {
          batch: Math.floor(pack.accepted / labChunkSize) + 1, total: Math.ceil(pack.config.count / labChunkSize), attempt: pack.attempts + 1, maximum: pack.maxAttempts })}<br />{t('Waiting for the AI response. The server will then screen and save this batch.')}</p>}
        <p className={styles.fine}>{t("We check wording, units, format, and duplicates after each small batch. Factual accuracy is still unverified.")} {pack?.rejected > 0 && t('{count} candidates screened out.', { count: pack.rejected })}</p>
        {generationError && !details && <p className={styles.error} role='alert'>{t(generationError)}</p>}
        {!busy && <div className={styles.buttons}>{(!details || dismissed) && <button className='button' disabled={blocked || details?.retryable === false} onClick={() => generate(true)}>{t("Resume generation")}<ArrowRight size={16} /></button>}{pack?.accepted > 0 && <button className='button button-secondary' onClick={keepPartial}>{t("Keep these")} {pack.accepted} {t("questions")}</button>}<button className={styles.textButton} onClick={edit}>{t("Edit configuration")}</button></div>}
        {busy && <p className={styles.fine}>{t("You can return to your game. This batch will finish and be saved; further batches wait for you to resume.")}</p>}
      </div>
    </section> : completed ? <section className={styles.results}>
      <div className={styles.resultHeading}><div className={styles.resultIcon}><Layers size={28} /></div><span className={styles.eyebrow}>{t("YOUR EXPERIMENT, ASSEMBLED")}</span>
        <h2 tabIndex={-1} ref={titleRef}>{pack.accepted ? t("A fresh pack. A new rabbit hole.") : t("This experiment needs another try.")}</h2><p>{t(topicLabel(pack.config, locale))} · {metadataLabel(pack.config.difficulty)} · {t(levels[pack.config.knowledge])}</p>
        {pack.config.knowledge === 'custom' && <p>{pack.config.challenge}</p>}</div>
      <dl className={styles.stats}><div><dt>{t("Requested")}</dt><dd>{pack.config.count}</dd></div><div><dt>{t("Accepted")}</dt><dd>{pack.accepted}</dd></div><div><dt>{t("Factual review")}</dt><dd className={styles.smallStat}>{t("Unverified")}</dd></div></dl>
      {pack.accepted < pack.config.count && <p className={styles.partial} role='status'>{pack.accepted === 0 && pack.rejected === 0 ? t("No usable question batch was returned. No questions reached screening, and there is no playable pack yet.") : <>{t("Only")} {pack.accepted} {t("of")} {pack.config.count} {t("questions passed screening.")} {pack.rejected} {t("candidates were rejected. We haven’t filled the gaps with substitutes.")}</>}</p>}
      <div className={styles.previewCards}>{pack.questions.slice(0, 3).map((question, index) => <article key={question.id} className={styles.previewCard}><span>{t("QUESTION")} {String(index + 1).padStart(2, '0')}<Star size={14} /></span><h3>{question.question}</h3><p>{metadataLabel(question.category)}<span>{t("Answer sealed")}</span></p></article>)}</div>
      <p className={styles.fine}>{t("Generated by AI · Not validated or curated · Answers stay sealed until a successful challenge. Private to this browser, available for 24 hours. Your regular game is saved while you explore.")}</p>
      {!details && pack.models && <ModelRouting models={pack.models} />}
      {generationError && !details && <p className={styles.error} role='alert'>{t(generationError)}</p>}
      <div className={styles.buttons}>{pack.accepted > 0 && <Link className='button' href={`/question-lab/play/${pack.id}`}>{t("Start playing")}<ArrowRight size={17} /></Link>}{(!details || dismissed) && <button className='button button-secondary' disabled={blocked} onClick={() => generate()}><RefreshCw size={16} />{t("Regenerate pack")}</button>}<button className={styles.textButton} onClick={edit}>{t("Edit configuration")}</button></div>
    </section> : <div className={styles.workspace}>
      <form className={styles.form} onSubmit={event => {
        event.preventDefault();
        generate();
      }}>
        <div className={styles.sectionTitle}><Sliders size={18} /><h2>{t("Mix your next obsession")}</h2><span>{t("01 — CONFIGURE")}</span></div>
        <fieldset><legend><span className={styles.step}>1</span>{t("Pick a pack size")}</legend><div className={styles.sizes}>{[10, 15, 20].map(count => <button type='button' key={count} aria-pressed={config.count === count} onClick={() => update({
              count
            })}><strong>{count}</strong><span>{t("questions")}</span>{config.count === count && <Check size={14} />}</button>)}</div></fieldset>
        <fieldset><legend><span className={styles.step}>2</span>{t("What are we exploring?")}</legend>
          <div className={styles.tabs} role='group' aria-label={t("Topic source")}>{[['surprise', t("Surprise me")], ['categories', t("Categories")], ['custom', t("My own topic")]].map(([mode, label]) => <button type='button' key={mode} aria-pressed={config.topicMode === mode} onClick={() => update({
              topicMode: mode
            })}>{mode === 'surprise' && <Shuffle size={14} />}{t(label)}</button>)}</div>
          {config.topicMode === 'surprise' ? <div className={styles.surprise}><span>✦</span><div><strong>{t("Follow the unexpected.")}</strong><p>{t("A curious mix of subjects, with a few delightful detours.")}</p></div></div> : config.topicMode === 'categories' ? <div><p className={styles.hint}>{t("Choose up to 3 from the game’s question bank.")}</p><div className={styles.categoryGrid}>{categories.map(category => <button type='button' key={category} aria-pressed={config.categories.includes(category)} disabled={!config.categories.includes(category) && config.categories.length >= 3} onClick={() => update({
                categories: config.categories.includes(category) ? config.categories.filter(value => value !== category) : [...config.categories, category]
              })}>{metadataLabel(category)}{config.categories.includes(category) && <Check size={13} />}</button>)}</div></div> : <div className={styles.customTopic}><label htmlFor='lab-topic'>{t("Your rabbit hole")}</label><input id='lab-topic' value={config.topic} maxLength={160} minLength={2} placeholder={t("e.g. Pokémon, dinosaurs, the human body…")} onChange={event => update({
              topic: event.target.value
            })} required /><p className={styles.hint}>{t("A subject, a niche, an entire universe. 2–160 characters.")}</p><div className={styles.ideas}>{ideas.map(idea => <button type='button' key={idea} onClick={() => update({
                topic: idea
              })}>{t(idea)}<span>↗</span></button>)}</div></div>}
        </fieldset>
        <fieldset><legend><span className={styles.step}>3</span>{t("Set the challenge")}</legend><p className={styles.fieldLabel} id='lab-difficulty-label'>{t("Difficulty")}</p><div className={styles.difficulties} role='group' aria-labelledby='lab-difficulty-label'>{['easy', 'medium', 'hard', 'mixed'].map(difficulty => <button key={difficulty} type='button' aria-pressed={config.difficulty === difficulty} onClick={() => update({
              difficulty
            })}>{metadataLabel(difficulty)}</button>)}</div>
          <label className={styles.fieldLabel} htmlFor='lab-knowledge'>{t("Who’s at the table?")}</label><select id='lab-knowledge' value={config.knowledge} onChange={event => update({
            knowledge: event.target.value
          })}>{Object.entries(levels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select>
          {config.knowledge === 'custom' && <div className={styles.challenge}><label htmlFor='lab-challenge'>{t("Describe your challenge")}</label><input id='lab-challenge' value={config.challenge} minLength={2} maxLength={160} placeholder={t("e.g. Questions a 10-year-old could answer")} onChange={event => update({
              challenge: event.target.value
            })} required /><p className={styles.hint}>{t("2–160 characters. This guides the AI; it isn’t a factual guarantee.")}</p></div>}
        </fieldset>
        {error && !details && <p className={styles.error} role='alert'>{t(error)}</p>}
        <div className={styles.formFooter}><button className='button' disabled={!valid || unavailable || restoring || blocked}><Zap size={17} />{restoring ? t("Checking for a saved experiment…") : t('Generate {count} questions', { count: config.count })}<ArrowRight size={17} /></button><p>{t("Real AI generation. Usually a few small batches.")}<br />{t("Up to 3 packs per browser per hour.")}</p></div>
      </form>
      <aside className={styles.recipe}><div className={styles.recipeTop}><span>{t("THE RECIPE")}</span><span>✳</span></div><PackArt topic={t(topicLabel(config, locale))} count={config.count} /><div className={styles.recipeDetails}><h3>{t("A pack with your name on it.")}</h3><p>{t('{count} numerical questions · {difficulty} difficulty · {level}', { count: config.count, difficulty: metadataLabel(config.difficulty), level: t(levels[config.knowledge]) })}</p><ul><li><Check size={14} />{t("Made for the way you play")}</li><li><Check size={14} />{t("Answers hidden until the reveal")}</li><li><Check size={14} />{t("Your regular game stays saved")}</li></ul></div><div className={styles.recipeNote}>{t("A small experiment in big curiosity.")}<br />{t("What will you discover?")}</div></aside>
    </div>}
    <footer className={styles.labFooter}><span>NO WAY LABS <span aria-hidden='true'>✳</span> {t("KEEP ASKING.")}</span><Link href='/'>{t("Return to regular gameplay")}<ArrowRight size={14} /></Link></footer>
  </main>;
}
