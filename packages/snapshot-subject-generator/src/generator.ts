import path from "node:path";
import cliProgress from "cli-progress";
import {
  IModelHost,
  SnapshotDb,
  Subject,
  SubjectOwnsSubjects,
  withEditTxn,
} from "@itwin/core-backend";
import { IModel, type SubjectProps } from "@itwin/core-common";

export interface GenerateSnapshotIModelOptions {
  outputPath: string;
  count: number;
  batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 50_000;
const DEFAULT_PROGRESS_UPDATE_INTERVAL = 1_000;

function createSubjectProps(db: SnapshotDb, subjectName: string): SubjectProps {
  return {
    classFullName: Subject.classFullName,
    model: IModel.repositoryModelId,
    parent: new SubjectOwnsSubjects(IModel.rootSubjectId),
    code: Subject.createCode(db, IModel.rootSubjectId, subjectName),
    userLabel: subjectName,
  };
}

export async function generateSnapshotIModel(
  options: GenerateSnapshotIModelOptions,
): Promise<void> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const rootSubjectName = path.parse(options.outputPath).name || "SnapshotSubjectGenerator";

  const progressBar = new cliProgress.SingleBar(
    {
      format: "Inserting subjects |{bar}| {percentage}% || {value}/{total}",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );

  await IModelHost.startup();

  const db = SnapshotDb.createEmpty(options.outputPath, {
    rootSubject: {
      name: rootSubjectName,
    },
  });

  progressBar.start(options.count, 0);

  try {
    await withEditTxn(db, "Insert generated subjects", async (txn) => {
      for (let index = 1; index <= options.count; index += 1) {
        const subjectName = `Subject-${index}`;
        txn.insertElement(createSubjectProps(db, subjectName));

        if (index % batchSize === 0) {
          txn.saveChanges(`Inserted ${index} subjects`);
        }

        if (
          index % DEFAULT_PROGRESS_UPDATE_INTERVAL === 0 ||
          index % batchSize === 0 ||
          index === options.count
        ) {
          progressBar.update(index);
        }
      }
    });
  } finally {
    progressBar.stop();
    db.close();
    await IModelHost.shutdown();
  }
}
