import { useUiStore } from '../../store/uiStore'
import { t } from '../../../../shared/i18n'
import styles from './WelcomeScreen.module.css'

function DefList({
  items,
}: {
  items: { term: string; desc: string }[]
}): JSX.Element {
  return (
    <dl className={styles.defList}>
      {items.map((item) => (
        <div key={item.term} className={styles.defItem}>
          <dt>{item.term}</dt>
          <dd>{item.desc}</dd>
        </div>
      ))}
    </dl>
  )
}

function KeyList({
  items,
}: {
  items: { key: string; desc: string }[]
}): JSX.Element {
  return (
    <dl className={styles.keyList}>
      {items.map((item) => (
        <div key={item.key} className={styles.keyItem}>
          <dt><kbd>{item.key}</kbd></dt>
          <dd>{item.desc}</dd>
        </div>
      ))}
    </dl>
  )
}

export function WelcomeScreen(): JSX.Element {
  const { setModelManagerOpen, setSettingsOpen } = useUiStore()

  return (
    <div className={styles.screen}>
      <div className={styles.scroll}>
        <header className={styles.hero}>
          <div className={styles.logo}>⬡</div>
          <h1 className={styles.name}>{t.appName}</h1>
          <p className={styles.sub}>{t.appSubtitle}</p>
        </header>

        <div className={styles.guide}>
          <p className={styles.guideLead}>{t.welcomeGuideTitle}</p>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t.welcomeLayoutTitle}</h2>
            <p className={styles.sectionText}>{t.welcomeLayoutHint}</p>
            <DefList
              items={[
                { term: t.welcomeZoneActivity, desc: t.welcomeZoneActivityDesc },
                { term: t.welcomeZoneExplorer, desc: t.welcomeZoneExplorerDesc },
                { term: t.welcomeZoneEditor, desc: t.welcomeZoneEditorDesc },
                { term: t.welcomeZoneAi, desc: t.welcomeZoneAiDesc },
                { term: t.welcomeZoneTerminal, desc: t.welcomeZoneTerminalDesc },
                { term: t.welcomeZoneStatus, desc: t.welcomeZoneStatusDesc },
              ]}
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t.welcomeExplorerTitle}</h2>
            <p className={styles.sectionText}>{t.welcomeExplorerIntro}</p>

            <h3 className={styles.subTitle}>{t.welcomeExplorerMouseTitle}</h3>
            <ul className={styles.bullets}>
              <li>{t.welcomeExplorerMouse1}</li>
              <li>{t.welcomeExplorerMouse2}</li>
              <li>{t.welcomeExplorerMouse3}</li>
              <li>{t.welcomeExplorerMouse4}</li>
              <li>{t.welcomeExplorerMouse5}</li>
              <li>{t.welcomeExplorerMouse6}</li>
            </ul>

            <h3 className={styles.subTitle}>{t.welcomeExplorerToolbarTitle}</h3>
            <ul className={styles.bullets}>
              <li>{t.welcomeExplorerToolbar1}</li>
              <li>{t.welcomeExplorerToolbar2}</li>
              <li>{t.welcomeExplorerToolbar3}</li>
              <li>{t.welcomeExplorerToolbar4}</li>
            </ul>

            <h3 className={styles.subTitle}>{t.welcomeExplorerHotkeysTitle}</h3>
            <KeyList
              items={[
                { key: t.welcomeExplorerKeyCopy, desc: t.welcomeExplorerKeyCopyDesc },
                { key: t.welcomeExplorerKeyCut, desc: t.welcomeExplorerKeyCutDesc },
                { key: t.welcomeExplorerKeyPaste, desc: t.welcomeExplorerKeyPasteDesc },
                { key: t.welcomeExplorerKeyDelete, desc: t.welcomeExplorerKeyDeleteDesc },
                { key: t.welcomeExplorerKeyRename, desc: t.welcomeExplorerKeyRenameDesc },
                { key: t.welcomeExplorerKeyEnter, desc: t.welcomeExplorerKeyEnterDesc },
                { key: t.welcomeExplorerKeyArrows, desc: t.welcomeExplorerKeyArrowsDesc },
                { key: t.welcomeExplorerKeyEsc, desc: t.welcomeExplorerKeyEscDesc },
              ]}
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t.welcomeEditorTabsTitle}</h2>
            <p className={styles.sectionText}>{t.welcomeEditorTabsIntro}</p>
            <DefList
              items={[
                { term: t.welcomeEditorTabsFile, desc: t.welcomeEditorTabsFileDesc },
                { term: t.welcomeEditorTabsBrowser, desc: t.welcomeEditorTabsBrowserDesc },
                { term: t.welcomeEditorTabsConsole, desc: t.welcomeEditorTabsConsoleDesc },
                { term: t.welcomeEditorTabsPowerShell, desc: t.welcomeEditorTabsPowerShellDesc },
              ]}
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t.welcomeAiTitle}</h2>
            <p className={styles.sectionText}>{t.welcomeAiIntro}</p>
            <DefList
              items={[
                { term: t.welcomeAiModeAgent, desc: t.welcomeAiModeAgentDesc },
                { term: t.welcomeAiModePlan, desc: t.welcomeAiModePlanDesc },
                { term: t.welcomeAiModeChat, desc: t.welcomeAiModeChatDesc },
              ]}
            />
            <p className={styles.sectionText}>{t.welcomeAiHistory}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t.welcomeComposerTitle}</h2>
            <p className={styles.sectionText}>{t.welcomeComposerIntro}</p>
            <DefList
              items={[
                { term: t.welcomeComposerContext, desc: t.welcomeComposerContextDesc },
                { term: t.welcomeComposerFiles, desc: t.welcomeComposerFilesDesc },
                { term: t.welcomeComposerTodos, desc: t.welcomeComposerTodosDesc },
                { term: t.welcomeComposerStop, desc: t.welcomeComposerStopDesc },
                { term: t.welcomeComposerPrompt, desc: t.welcomeComposerPromptDesc },
              ]}
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t.welcomeModelsTitle}</h2>
            <p className={styles.sectionText}>{t.welcomeModelsDesc}</p>
            <ol className={styles.steps}>
              <li>{t.welcomeModelsStep1}</li>
              <li>{t.welcomeModelsStep2}</li>
            </ol>
            <DefList
              items={[
                { term: t.welcomeModelsFieldDisplay, desc: t.welcomeModelsFieldDisplayDesc },
                { term: t.welcomeModelsFieldApi, desc: t.welcomeModelsFieldApiDesc },
                { term: t.welcomeModelsFieldUrl, desc: t.welcomeModelsFieldUrlDesc },
                { term: t.welcomeModelsFieldToken, desc: t.welcomeModelsFieldTokenDesc },
                { term: t.welcomeModelsFieldContext, desc: t.welcomeModelsFieldContextDesc },
                { term: t.welcomeModelsFieldSampling, desc: t.welcomeModelsFieldSamplingDesc },
              ]}
            />
            <button type="button" className={styles.linkBtn} onClick={() => setModelManagerOpen(true)}>
              {t.welcomeOpenModels}
            </button>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t.welcomeAgentTitle}</h2>
            <p className={styles.sectionText}>{t.welcomeAgentIntro}</p>
            <DefList
              items={[
                { term: t.welcomeAgentAutoApply, desc: t.welcomeAgentAutoApplyDesc },
                { term: t.welcomeAgentMaxSteps, desc: t.welcomeAgentMaxStepsDesc },
                { term: t.welcomeAgentMaxWall, desc: t.welcomeAgentMaxWallDesc },
                { term: t.welcomeAgentAutoContinue, desc: t.welcomeAgentAutoContinueDesc },
                { term: t.welcomeAgentSummarize, desc: t.welcomeAgentSummarizeDesc },
                { term: t.welcomeAgentSummarizeMode, desc: t.welcomeAgentSummarizeModeDesc },
                { term: t.welcomeAgentSummarizeModel, desc: t.welcomeAgentSummarizeModelDesc },
                { term: t.welcomeAgentTavily, desc: t.welcomeAgentTavilyDesc },
              ]}
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t.welcomeMcpTitle}</h2>
            <p className={styles.sectionText}>{t.welcomeMcpIntro}</p>
            <DefList
              items={[
                { term: t.welcomeMcpScope, desc: t.welcomeMcpScopeDesc },
                { term: t.welcomeMcpFormat, desc: t.welcomeMcpFormatDesc },
              ]}
            />
            <p className={styles.sectionText}>{t.welcomeMcpReload}</p>
            <button type="button" className={styles.linkBtn} onClick={() => setSettingsOpen(true)}>
              {t.welcomeOpenSettings}
            </button>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t.welcomeMiscTitle}</h2>
            <ul className={styles.bullets}>
              <li>{t.welcomeMiscTerminal}</li>
              <li>{t.welcomeMiscTheme}</li>
              <li>{t.welcomeMiscPalette}</li>
              <li>{t.welcomeMiscProject}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
