import type { NextPage } from "next";
import Head from "next/head";
import useSWR from "swr";
import Image from "next/image";
import styles from "../../styles/GlobalSettings.module.scss";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import Button from "../../components/button";
import {
  BundlrWrapper,
  displayRechargeArweave,
} from "../../components/utils/bundlr";
import { PublicKey, Transaction } from "@solana/web3.js";
import Router from "next/router";
import {
  ConfigInputType,
  PDAType,
  TermsInputsType,
} from "../types/game-settings";

import {
  Bundlr,
  FileType,
  FilesType,
  initSolanaProgram,
  SolanaProgramType,
  config_pda,
  fetch_pdas,
  stats_pda,
  MAX_TERMS,
  solana_usd_price,
  terms_pda,
  lamports_to_sol,
  solana_to_usd,
  TermsType,
  arweave_json,
  system_config_pda,
  SYSTEM_AUTHORITY,
  SystemConfigType,
  StatsType,
} from "@cubist-collective/cubist-games-lib";
import { DEFAULT_DECIMALS } from "../../components/utils/number";
import {
  COMBINED_INPUTS,
  validateCombinedInput,
  validateInput,
} from "../../components/validation/settings";
import { SettingsError } from "../../components/validation/errors";
import {
  inputsToRustSettings,
  fetch_configs,
} from "../../components/utils/game-settings";
import { ReactNode } from "react";
import {
  fetcher,
  multi_request,
  new_domain,
} from "../../components/utils/requests";
import {
  flashError,
  flashMsg,
  is_authorized,
} from "../../components/utils/helpers";
import { RechargeArweaveType } from "../../components/recharge-arweave/types";
import { AnimatePresence, motion } from "framer-motion";
import { AnchorError } from "@project-serum/anchor";
import Link from "next/link";

const Input = dynamic(() => import("../../components/input"));
const Textarea = dynamic(() => import("../../components/textarea"));
const Icon = dynamic(() => import("../../components/icon"));
const Modal = dynamic(() => import("../../components/modal"));
const GeneralSettings = dynamic(
  () => import("../../components/settings/general")
);
const StakeButtons = dynamic(
  () => import("../../components/settings/stake-buttons")
);
const ProfitSharing = dynamic(
  () => import("../../components/settings/profit-sharing")
);
const RechargeArweave = dynamic(
  () => import("../../components/recharge-arweave")
);

const EMPTY_TERMS: TermsInputsType = {
  bump: null,
  loading: false,
  id: "",
  title: "",
  description: "",
};

const GameSettings: NextPage = () => {
  const { connection } = useConnection();
  const { data } = useSWR("/api/idl", fetcher);
  const { publicKey, wallet, sendTransaction } = useWallet();
  const [authority, _setAuthority] = useState<PublicKey>(
    new PublicKey(process.env.NEXT_PUBLIC_AUTHORITY as string)
  );
  const [configExists, setConfigExists] = useState<boolean>(false);
  const [solUsdPrice, setSolUsdPrice] = useState<number | null>(null);
  const [pdas, setPdas] = useState<PDAType[] | null>(null);
  const [rechargeArweave, setRechargeArweave] = useState<RechargeArweaveType>({
    display: false,
    value: 1,
    requiredSol: 0,
    solBalance: 0,
    requiredUsd: 0,
    recommendedSol: 0,
    error: false,
    loading: false,
    decimals: 9,
    closeModals: {},
  });
  const [files, setFiles] = useState<FilesType>({});
  const [maxDecimals, setMaxDecimals] = useState<number>(DEFAULT_DECIMALS);
  const [bundlr, setBundlr] = useState<Bundlr | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [termsErrors, setTermsErrors] = useState<{
    [key: string]: string;
  }>({});
  const [solanaProgram, setSolanaProgram] = useState<SolanaProgramType | null>(
    null
  );
  const [systemConfig, setSystemConfig] = useState<SystemConfigType | null>(
    null
  );
  const [stats, setStats] = useState<StatsType | null>(null);
  const [settings, setSettings] = useState<ConfigInputType>({
    https: true, // Populated on page load using window.location.protocol
    domain: "", // Populated on page load using window.location.host
    fee: 7,
    showPot: true,
    useCategories: false,
    allowReferral: true,
    fireThreshold: 100,
    minStake: 0.1,
    minStep: 0.1,
    customStakeButton: true,
    stakeButtons: [0.1, 0.2, 0.5, 1],
    designTemplatesHash: null,
    categoriesHash: null,
    profitSharing: [],
    terms: [],
  });
  const [terms, setTerms] = useState<TermsInputsType>(EMPTY_TERMS);
  const [modals, setModals] = useState({
    main: false,
    terms: false,
  });
  const [mainModalContent, setMainModalContent] = useState<ReactNode>(null);

  const showModal = (content: any) => {
    setMainModalContent(content);
    setModals({ ...modals, main: true });
  };
  const validateSettingsField = (
    key: string,
    value: any,
    nameSpace: string = "",
    updatedSettings: { [key: string]: any } = {}
  ): boolean => {
    try {
      const allSettings = {
        SystemConfig: systemConfig as SystemConfigType,
        Settings: settings,
        ...updatedSettings,
      };
      validateInput(key, value, nameSpace);
      validateCombinedInput(key, allSettings, nameSpace);
      return true;
    } catch (error) {
      if (error instanceof SettingsError) {
        switch (nameSpace) {
          case "Terms":
            setTermsErrors({ ...termsErrors, [error.code]: error.message });
            break;
          default:
            setErrors({ ...errors, [error.code]: error.message });
        }
        if (error.code != "profitSharing") {
          flashMsg(error.message, "error", 2500);
        }
      }
    }
    return false;
  };

  const handleUpdateSettings = (key: string, value: any) => {
    delete errors[key];
    setErrors(errors);
    const updatedSettings = { ...settings, [key]: value };
    if (validateSettingsField(key, value, "", { Settings: updatedSettings })) {
      if (key in COMBINED_INPUTS) {
        COMBINED_INPUTS[key].map((input: string) => delete errors[input]);
        setErrors(errors);
      }
    }
    setSettings(updatedSettings);
  };

  const handleUpdateTerms = (key: string, value: any) => {
    delete termsErrors[key];
    setTermsErrors(termsErrors);
    const updatedTerms = { ...terms, [key]: value };
    validateSettingsField(key, value, "Terms", { Terms: updatedTerms });
    setTerms(updatedTerms);
  };

  const handleSave = () => {
    // Update Domain if has changed
    let config = new_domain(settings.domain)
      ? {
          ...settings,
          https: window.location.protocol === "https:",
          domain: window.location.host.slice(0, 32), // Cannot be longer than 32 char
        }
      : settings;
    for (const [key, value] of Object.entries(config)) {
      if (!validateSettingsField(key, value)) return;
    }
    (async () => {
      if (!pdas) {
        return;
      }
      try {
        !configExists
          ? // Create new Config
            await solanaProgram?.methods
              .initializeConfig(inputsToRustSettings(config, maxDecimals))
              .accounts({
                authority: authority,
                systemConfig: pdas[0][0],
                config: pdas[1][0],
                stats: pdas[2][0],
              })
              .rpc()
          : // Update existing config
            await solanaProgram?.methods
              .updateConfig(inputsToRustSettings(config, maxDecimals))
              .accounts({
                authority: authority,
                systemConfig: pdas[0][0],
                config: pdas[1][0],
              })
              .rpc();

        flashMsg("Configuration saved!", "success");
        Router.push("/admin");
      } catch (error) {
        if (!(error instanceof AnchorError)) {
          throw error;
        }
        flashMsg(`${error.error.errorMessage}`);
      }
    })();
  };

  const handleSaveTerms = async () => {
    for (const [key, value] of Object.entries(terms)) {
      if (!validateSettingsField(key, value, "Terms")) return;
    }
    if (!bundlr || !solanaProgram || !pdas) return;
    const termsJSONString = JSON.stringify(
      (({ bump, loading, ...t }) => t)(terms)
    );
    const [balance, [termsPda, termsBump], price] = await multi_request([
      [bundlr.balance, []],
      [terms_pda, [authority, terms.id]],
      [bundlr.getPrice, [Buffer.byteLength(termsJSONString, "utf8")]],
    ]);
    // Reacharge Arweave when there is not enough balance
    if (
      displayRechargeArweave(
        price,
        balance,
        rechargeArweave,
        setRechargeArweave,
        solUsdPrice as number,
        maxDecimals
      )
    ) {
      return;
    }
    const arweaveHash = await bundlr?.uploadJSON(termsJSONString);
    setTerms({ ...terms, loading: true });
    flashMsg("Uploading Terms & Conditions to Arweave...", "success");
    // Check if Terms PDA already exists
    let termsPDAExists = true;
    try {
      await solanaProgram?.account.terms.fetch(termsPda);
    } catch (e) {
      termsPDAExists = false;
    }
    try {
      // Update existing Terms & Conditions
      if (termsPDAExists) {
        await solanaProgram.methods
          .updateTerms(terms.id as string, arweaveHash as string)
          .accounts({
            authority: authority,
            config: pdas[1][0],
            terms: termsPda,
          })
          .rpc();
      } else {
        // Create new Terms & Conditions
        await solanaProgram.methods
          .createTerms(terms.id as string, arweaveHash as string)
          .accounts({
            authority: authority,
            config: pdas[1][0],
            terms: termsPda,
          })
          .rpc();
        setSettings({
          ...settings,
          terms: settings.terms.concat([{ id: terms.id, bump: termsBump }]),
        });
      }
      setModals({ ...modals, terms: false });
      flashMsg(
        `${
          termsPDAExists ? "Updated" : "Created new"
        } Terms & Conditions successfully`,
        "success"
      );
    } catch (error) {
      if (!(error instanceof AnchorError)) {
        throw error;
      }
      flashMsg(`${error.error.errorMessage}`);
    } finally {
      setTerms({ ...terms, loading: false });
    }
  };

  const handleUpdateArweaveInput = (value: string) => {
    setRechargeArweave({ ...rechargeArweave, value: parseFloat(value) });
  };
  const handleRechargeArweave = async () => {
    try {
      setRechargeArweave({ ...rechargeArweave, loading: true });
      await bundlr?.fund(rechargeArweave.value);
      setRechargeArweave({
        ...rechargeArweave,
        loading: false,
        display: false,
      });
    } catch (error) {
      console.error(error);
      setRechargeArweave({ ...rechargeArweave, loading: false });
    }
  };
  const handleEditTerms = async (termsId: string) => {
    setTerms({ ...terms, loading: true });
    setModals({ ...modals, terms: true });
    const [termsPda, termsBump] = await terms_pda(authority, termsId);
    const termsData = await solanaProgram?.account.terms.fetch(termsPda);
    const termsContent = await arweave_json(termsData?.arweaveHash as string);
    setTerms({
      bump: termsBump,
      loading: false,
      id: termsId,
      title: termsContent.title,
      description: termsContent.description,
    });
  };

  // Init Bundlr
  useEffect(() => {
    if (!publicKey || !wallet || bundlr) return;
    (async () => {
      setBundlr(await BundlrWrapper(connection, wallet.adapter));
    })();
  }, [publicKey, wallet, connection, bundlr]);

  // Step 1 - Init Program and PDAs
  useEffect(() => {
    if (!publicKey || !wallet || !data || solanaProgram) return;
    (async () => {
      setSolUsdPrice(await solana_usd_price());
      setMaxDecimals(DEFAULT_DECIMALS);
      setPdas(
        await flashError(fetch_pdas, [
          [system_config_pda, SYSTEM_AUTHORITY],
          [config_pda, authority],
          [stats_pda, authority],
        ])
      );
      setSolanaProgram(
        await initSolanaProgram(JSON.parse(data), connection, wallet.adapter)
      );
    })();
  }, [publicKey, wallet, connection, data, solanaProgram, authority]);

  // Fetch Configs
  useEffect(() => {
    if (!solanaProgram || !pdas) return;
    (async () => {
      setConfigExists(
        await fetch_configs(
          settings,
          solanaProgram,
          pdas,
          setSystemConfig,
          setSettings,
          setStats,
          maxDecimals
        )
      );
    })();
  }, [solanaProgram, pdas]);

  return (
    <div className={styles.container}>
      <Head>
        <title>Games Settings</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      {!is_authorized(publicKey) ? (
        <main className={styles.main}>Not registered</main>
      ) : (
        <main className={styles.main}>
          <h1 className={styles.title}>Games Settings</h1>
          <div>New games will be created with this settings by default</div>
          <GeneralSettings
            settings={settings}
            errors={errors}
            showModal={showModal}
            handleUpdateSettings={handleUpdateSettings}
          />
          <StakeButtons
            settings={settings}
            errors={errors}
            showModal={showModal}
            handleUpdateSettings={handleUpdateSettings}
            maxDecimals={maxDecimals}
          />
          {/* <fieldset className={styles.grid}>
            <h2>Categories</h2>

            <label>
              <span>Use categories</span>
              <Checkbox
                name="useCategories"
                value={settings.useCategories}
                onClick={() =>
                  handleUpdateSettings("useCategories", !settings.useCategories)
                }
              />
            </label>
          </fieldset> */}
          {systemConfig ? (
            <ProfitSharing
              systemConfig={systemConfig}
              settings={settings}
              errors={errors}
              showModal={showModal}
              handleUpdateSettings={handleUpdateSettings}
              modals={modals}
              setModals={setModals}
            />
          ) : (
            ""
          )}
          {configExists ? (
            <fieldset className={styles.grid}>
              <h2>
                Terms &amp; Conditions{" "}
                {settings.terms.length < MAX_TERMS ? (
                  <Button
                    onClick={() => {
                      setTerms(EMPTY_TERMS);
                      setModals({ ...modals, terms: true });
                    }}
                  >
                    +
                  </Button>
                ) : (
                  ""
                )}
              </h2>
              <ul>
                {settings.terms.map((t: TermsType) => (
                  <li
                    key={`terms-${t.id}`}
                    onClick={() => handleEditTerms(t.id)}
                  >
                    {t.id}
                  </li>
                ))}
              </ul>
              <div>
                <Modal modalId={"terms"} modals={modals} setIsOpen={setModals}>
                  <AnimatePresence>
                    {rechargeArweave.display ? (
                      <RechargeArweave
                        {...rechargeArweave}
                        handleUpdate={(value: string) =>
                          handleUpdateArweaveInput(value)
                        }
                        handleRechargeArweave={() => handleRechargeArweave()}
                      />
                    ) : (
                      <motion.div>
                        <h4>
                          {terms.bump ? "Edit" : "New"} Terms & Conditions
                        </h4>
                        {terms.loading ? (
                          <div>Loading...</div>
                        ) : (
                          <fieldset>
                            <div>
                              <label className={"aligned"}>
                                <span>
                                  ID:{" "}
                                  <Input
                                    type="text"
                                    placeholder="E.g. NBA"
                                    className={
                                      termsErrors.hasOwnProperty("id")
                                        ? "error"
                                        : null
                                    }
                                    name={`id`}
                                    maxLength={4}
                                    value={terms.id}
                                    readOnly={terms.bump ? true : false}
                                    onChange={(
                                      e: React.ChangeEvent<HTMLInputElement>
                                    ) =>
                                      handleUpdateTerms("id", e.target.value)
                                    }
                                  />
                                </span>
                              </label>
                              <legend>
                                Codename to identify your Terms & Conditions
                              </legend>
                            </div>
                            <label className={"aligned"}>
                              Title:{" "}
                              <Input
                                type="text"
                                className={
                                  termsErrors.hasOwnProperty("title")
                                    ? "error"
                                    : null
                                }
                                name={`title`}
                                maxLength={64}
                                value={terms.title}
                                onChange={(
                                  e: React.ChangeEvent<HTMLInputElement>
                                ) => handleUpdateTerms("title", e.target.value)}
                              />
                            </label>
                            <label className={"aligned"}>
                              <span>Description:</span>{" "}
                              <Textarea
                                name={`description`}
                                className={
                                  termsErrors.hasOwnProperty("description")
                                    ? "error"
                                    : null
                                }
                                maxLength={1000}
                                rows={4}
                                value={terms.description}
                                onChange={(
                                  e: React.ChangeEvent<HTMLInputElement>
                                ) =>
                                  handleUpdateTerms(
                                    "description",
                                    e.target.value
                                  )
                                }
                              />
                            </label>
                            <div className={"aligned"}>
                              <Button
                                onClick={() => handleSaveTerms()}
                                disabled={Boolean(
                                  Object.keys(termsErrors).length
                                )}
                              >
                                Save terms
                              </Button>
                              <Button
                                onClick={() =>
                                  setModals({ ...modals, terms: false })
                                }
                              >
                                Cancel
                              </Button>
                            </div>
                          </fieldset>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Modal>
              </div>
            </fieldset>
          ) : (
            ""
          )}
          <div>
            <Button
              onClick={() => handleSave()}
              disabled={Boolean(Object.keys(errors).length)}
            >
              Save
            </Button>
            <Link href={`/admin`}>
              <a>Cancel</a>
            </Link>
          </div>
          <Modal modalId={"main"} modals={modals} setIsOpen={setModals}>
            {mainModalContent}
          </Modal>
        </main>
      )}
    </div>
  );
};

export default GameSettings;