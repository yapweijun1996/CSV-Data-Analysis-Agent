// Downloads the Singapore open-data demo datasets from data.gov.sg and rebuilds
// demo-data/<id>.csv, demo-data/<id>.manifest.json and demo-data/catalog.json.
//
// Policy: source values are copied byte for byte as data.gov.sg serves them. Nothing
// is cleaned, renamed, reshaped, sorted or deduplicated, so the demos keep the
// source quirks ("na", "N.A.", "-", quoted thousands separators, mojibake, wide
// month columns, indented subtotal rows) that the analysis agent must handle.
// The only allowed change is a dataset's documented, deterministic `sample` rule,
// which keeps whole source lines in source order. If a source grows beyond the
// browser demo limits, the script stops instead of silently trimming it; add or
// adjust that dataset's sampling rule before re-running.
//
// Output is deterministic for a given source revision: manifests record the
// source's own lastUpdatedAt instead of a wall-clock generation time.
// catalog.json is generated here too: edit titles and translations in this file.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Node's built-in fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY is set
// (Node >= 22.21). Re-run once with it so the script also works behind a proxy.
const proxyFromEnv = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxyFromEnv && !process.env.NODE_USE_ENV_PROXY) {
    const child = spawnSync(process.execPath, ['--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
        stdio: 'inherit',
        env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
    });
    process.exit(child.status ?? 1);
}

const DEMO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'demo-data');
const METADATA_URL = (datasetId) => `https://api-production.data.gov.sg/v2/public/api/datasets/${datasetId}/metadata`;
const POLL_URL = (datasetId) => `https://api-open.data.gov.sg/v1/public/api/datasets/${datasetId}/poll-download`;
const INITIATE_URL = (datasetId) => `https://api-open.data.gov.sg/v1/public/api/datasets/${datasetId}/initiate-download`;
const VIEW_URL = (datasetId) => `https://data.gov.sg/datasets/${datasetId}/view`;
const LICENCE = 'Singapore Open Data Licence';
const LICENCE_URL = 'https://data.gov.sg/open-data-licence';
const MAX_BYTES = 1_500_000;
const MAX_ROWS = 10_000;
const TRANSFORMATION_POLICY = 'No source values are cleaned, normalized, renamed, reshaped, deduplicated, or sorted. Rows are the exact lines served by the data.gov.sg download API, copied byte for byte in source order; the only permitted change is the documented sampling rule below.';
const NO_SAMPLING = 'None. The full source file is within the browser demo limits (1.5 MB and 10,000 data rows), so the CSV is byte-identical to the download.';
const RENT_SAMPLE_QUARTERS = 60;

// The two HDB entries are built by the separate HDB scripts; only their catalog
// text lives here. Their statistics are measured from the files on disk.
const HDB_SOURCE = {
    publisher: 'Housing & Development Board',
    manifest: 'singapore-hdb-resale-prices.manifest.json',
    url: 'https://data.gov.sg/collections/189/view',
};
const HDB_ENTRIES = [
    {
        id: 'sg-hdb-resale-sample',
        file: 'singapore-hdb-resale-prices-sample.csv',
        theme: 'housing',
        speed: 'fast',
        title: {
            English: 'HDB resale prices (small sample)',
            Mandarin: '组屋转售价格（小样本）',
            Malay: 'Harga jualan semula HDB (sampel kecil)',
            Vietnamese: 'Giá bán lại HDB (mẫu nhỏ)',
            Japanese: 'HDB公営住宅の再販価格（小サンプル）',
        },
        description: {
            English: 'About 5,000 raw HDB resale transactions sampled from 1990 to today, for a quick first run.',
            Mandarin: '从1990年至今的组屋转售原始交易中抽取约5,000笔，适合快速试用。',
            Malay: 'Kira-kira 5,000 transaksi jualan semula HDB mentah yang disampel dari tahun 1990 hingga kini, sesuai untuk percubaan pantas.',
            Vietnamese: 'Khoảng 5.000 giao dịch bán lại HDB thô được lấy mẫu từ năm 1990 đến nay, để chạy thử nhanh lần đầu.',
            Japanese: '1990年から現在までのHDB再販取引の生データから約5,000件を抽出した、すぐに試せるサンプルです。',
        },
        suggestedQuestion: {
            English: 'Which towns have seen the fastest growth in resale prices for 4-room flats over the past ten years?',
            Mandarin: '过去十年，哪些市镇的四房式组屋转售价格涨得最快？',
            Malay: 'Bandar manakah yang mencatat kenaikan harga jualan semula flat 4 bilik paling pantas dalam tempoh sepuluh tahun lalu?',
            Vietnamese: 'Những khu nào có giá bán lại căn hộ 4 phòng tăng nhanh nhất trong mười năm qua?',
            Japanese: '過去10年間で、4ルームフラットの再販価格が最も速く上昇したタウンはどこですか？',
        },
    },
    {
        id: 'sg-hdb-resale-full',
        file: 'singapore-hdb-resale-prices.csv',
        theme: 'housing',
        speed: 'slow',
        title: {
            English: 'HDB resale prices (full history)',
            Mandarin: '组屋转售价格（完整历史）',
            Malay: 'Harga jualan semula HDB (sejarah penuh)',
            Vietnamese: 'Giá bán lại HDB (toàn bộ lịch sử)',
            Japanese: 'HDB公営住宅の再販価格（全期間）',
        },
        description: {
            English: 'Every raw HDB resale transaction since 1990, close to one million rows, so it loads slowly but gives the most complete test.',
            Mandarin: '收录1990年以来全部组屋转售原始交易，近一百万行，加载较慢，但测试最完整。',
            Malay: 'Semua transaksi jualan semula HDB mentah sejak tahun 1990, hampir sejuta baris, jadi ia lambat dimuatkan tetapi memberikan ujian paling lengkap.',
            Vietnamese: 'Mọi giao dịch bán lại HDB thô từ năm 1990, gần một triệu dòng, nên tải chậm nhưng cho phép kiểm thử đầy đủ nhất.',
            Japanese: '1990年以降のHDB再販取引の生データ全件（約100万行）で、読み込みは遅めですが最も網羅的に試せます。',
        },
        suggestedQuestion: {
            English: 'How has the median resale price per square metre changed for each flat type since 1990?',
            Mandarin: '自1990年以来，各类组屋每平方米转售价格的中位数是如何变化的？',
            Malay: 'Bagaimanakah harga jualan semula median bagi setiap meter persegi berubah untuk setiap jenis flat sejak tahun 1990?',
            Vietnamese: 'Giá bán lại trung vị trên mỗi mét vuông của từng loại căn hộ đã thay đổi thế nào kể từ năm 1990?',
            Japanese: '1990年以降、住戸タイプごとに1平方メートルあたりの再販価格の中央値はどのように変化しましたか？',
        },
    },
];

// The five data.gov.sg demos, chosen for different shapes and business themes.
const OPEN_DATA_DATASETS = [
    {
        id: 'sg-graduate-employment',
        datasetId: 'd_3c55210de27fcccda2ed0c63fdd2b352',
        theme: 'jobs',
        shape: 'Long table, one row per university degree and survey year. Salary columns publish both mean and median; suppressed results appear as "na" or "N.A.", some degree names carry footnote markers (*, **, #, ^), and a few school names contain mojibake from the source.',
        title: {
            English: 'Graduate employment and salaries',
            Mandarin: '大学毕业生就业与薪资',
            Malay: 'Pekerjaan dan gaji graduan',
            Vietnamese: 'Việc làm và lương của sinh viên tốt nghiệp',
            Japanese: '大学卒業生の就職率と給与',
        },
        description: {
            English: 'Employment rates and starting salaries by university and degree from Singapore\'s annual Graduate Employment Survey since 2013.',
            Mandarin: '来自新加坡年度大学毕业生就业调查，自2013年起按大学和学位统计的就业率与起薪。',
            Malay: 'Kadar pekerjaan dan gaji permulaan mengikut universiti dan ijazah daripada Tinjauan Pekerjaan Graduan tahunan Singapura sejak tahun 2013.',
            Vietnamese: 'Tỷ lệ có việc làm và lương khởi điểm theo trường đại học và bằng cấp, từ Khảo sát việc làm của sinh viên tốt nghiệp hằng năm của Singapore từ năm 2013.',
            Japanese: 'シンガポールの年次卒業生就職調査に基づく、2013年以降の大学・学位別の就職率と初任給です。',
        },
        suggestedQuestion: {
            English: 'Which degrees had the highest median gross monthly salary in the latest survey year, and where does the mean differ most from the median?',
            Mandarin: '在最新调查年度中，哪些学位的月薪总额中位数最高？哪些学位的平均数与中位数相差最大？',
            Malay: 'Ijazah manakah yang mempunyai gaji kasar bulanan median tertinggi pada tahun tinjauan terkini, dan di manakah nilai purata paling berbeza daripada median?',
            Vietnamese: 'Những ngành học nào có lương gộp hằng tháng trung vị cao nhất trong năm khảo sát mới nhất, và ở đâu giá trị trung bình chênh lệch nhiều nhất so với trung vị?',
            Japanese: '最新の調査年で月額総支給額の中央値が最も高かった学位はどれですか？また、平均値と中央値の差が最も大きいのはどの学位ですか？',
        },
    },
    {
        id: 'sg-coe-bidding',
        datasetId: 'd_69b3380ad7e51aff3a7dcc84eba52b8a',
        theme: 'transport',
        shape: 'Long time series, one row per month, bidding exercise and vehicle category (two exercises per month). Some bid counts are quoted strings with thousands separators such as "1,034".',
        title: {
            English: 'COE bidding results',
            Mandarin: '拥车证（COE）竞标结果',
            Malay: 'Keputusan bidaan COE',
            Vietnamese: 'Kết quả đấu giá COE',
            Japanese: 'COE（車両購入権）の入札結果',
        },
        description: {
            English: 'Quota, bids received and premium for every Certificate of Entitlement bidding exercise by vehicle category since 2010.',
            Mandarin: '自2010年以来，每轮拥车证竞标按车辆类别统计的配额、投标数量和溢价。',
            Malay: 'Kuota, bidaan yang diterima dan premium bagi setiap pusingan bidaan Sijil Kelayakan (COE) mengikut kategori kenderaan sejak tahun 2010.',
            Vietnamese: 'Hạn ngạch, số lượt đấu giá nhận được và mức phí của mọi đợt đấu giá Giấy chứng nhận quyền sở hữu xe (COE) theo loại xe từ năm 2010.',
            Japanese: '2010年以降の各COE入札回について、車両カテゴリー別の割当枠、応札数、落札価格（プレミアム）を示しています。',
        },
        suggestedQuestion: {
            English: 'How do quota changes relate to COE premiums for Category A and B cars, and which periods saw the sharpest price spikes?',
            Mandarin: 'A类和B类汽车的配额变化与拥车证溢价有什么关系？哪些时期出现了最急剧的价格飙升？',
            Malay: 'Bagaimanakah perubahan kuota berkait dengan premium COE bagi kereta Kategori A dan B, dan tempoh manakah yang menyaksikan lonjakan harga paling mendadak?',
            Vietnamese: 'Thay đổi hạn ngạch liên quan thế nào đến mức phí COE của xe hạng A và B, và giai đoạn nào có giá tăng vọt mạnh nhất?',
            Japanese: 'カテゴリーAとBの乗用車について、割当枠の変化はCOEプレミアムとどのように関係していますか？また、価格が最も急騰したのはどの時期ですか？',
        },
    },
    {
        id: 'sg-business-formation',
        datasetId: 'd_739ef616852dcc1ecdb4a1c8bd0dcc8b',
        theme: 'business',
        shape: 'Aggregated wide cross-tab: one row per industry (a Total row plus indented industry rows) and one column per month, newest month first, back to 1990. Analysis needs a wide-to-long reshape and must not double-count the Total row.',
        title: {
            English: 'New business formation by industry',
            Mandarin: '各行业新成立企业数量',
            Malay: 'Pembentukan perniagaan baharu mengikut industri',
            Vietnamese: 'Doanh nghiệp mới thành lập theo ngành',
            Japanese: '業種別の新規事業体設立数',
        },
        description: {
            English: 'Monthly counts of new business entities formed in Singapore by industry since 1990, laid out with one column per month.',
            Mandarin: '自1990年以来新加坡各行业每月新成立的企业实体数量，表格按每月一列的宽格式排列。',
            Malay: 'Bilangan bulanan entiti perniagaan baharu yang ditubuhkan di Singapura mengikut industri sejak tahun 1990, disusun dengan satu lajur bagi setiap bulan.',
            Vietnamese: 'Số lượng doanh nghiệp mới thành lập hằng tháng tại Singapore theo ngành từ năm 1990, bố trí mỗi tháng một cột.',
            Japanese: '1990年以降にシンガポールで設立された事業体の月次件数を業種別にまとめた、月ごとに1列が並ぶ横長の表です。',
        },
        suggestedQuestion: {
            English: 'Which industries grew new business formation the most over the past five years, and how seasonal are the monthly counts?',
            Mandarin: '过去五年中，哪些行业的新企业成立数量增长最多？每月数据的季节性有多明显？',
            Malay: 'Industri manakah yang mencatat pertumbuhan pembentukan perniagaan baharu paling tinggi dalam tempoh lima tahun lalu, dan sejauh manakah bilangan bulanan dipengaruhi musim?',
            Vietnamese: 'Những ngành nào tăng số doanh nghiệp mới thành lập nhiều nhất trong năm năm qua, và số liệu hằng tháng mang tính mùa vụ đến đâu?',
            Japanese: '過去5年間で新規事業体の設立数が最も伸びた業種はどれですか？また、月次件数にはどの程度の季節性がありますか？',
        },
    },
    {
        id: 'sg-resident-unemployment',
        datasetId: 'd_79699e0bd51d2d8cee7fb3f6d29dc7c4',
        theme: 'jobs',
        shape: 'Long cross-tab: one row per year, sex, age group and highest qualification, with a single non-seasonally-adjusted unemployment rate column. Answers need grouping and pivoting across four dimensions, and rates must not be summed.',
        title: {
            English: 'Unemployment rate by age, education and sex',
            Mandarin: '按年龄、学历和性别划分的居民失业率',
            Malay: 'Kadar pengangguran mengikut umur, pendidikan dan jantina',
            Vietnamese: 'Tỷ lệ thất nghiệp theo tuổi, trình độ học vấn và giới tính',
            Japanese: '年齢・学歴・性別でみた居住者の失業率',
        },
        description: {
            English: 'Unemployment rates of Singapore residents each June since 2010, broken down by sex, age group and highest qualification.',
            Mandarin: '自2010年以来每年6月新加坡居民的失业率，按性别、年龄组和最高学历细分。',
            Malay: 'Kadar pengangguran penduduk Singapura pada bulan Jun setiap tahun sejak 2010, dipecahkan mengikut jantina, kumpulan umur dan kelayakan tertinggi.',
            Vietnamese: 'Tỷ lệ thất nghiệp của cư dân Singapore vào tháng Sáu hằng năm từ năm 2010, chia theo giới tính, nhóm tuổi và trình độ cao nhất.',
            Japanese: '2010年以降、毎年6月時点のシンガポール居住者の失業率を、性別・年齢層・最終学歴別に示しています。',
        },
        suggestedQuestion: {
            English: 'Which age and education groups have the highest unemployment rates, and did the gap between men and women widen after 2020?',
            Mandarin: '哪些年龄和学历群体的失业率最高？2020年以后男女之间的差距是否扩大了？',
            Malay: 'Kumpulan umur dan pendidikan manakah yang mempunyai kadar pengangguran tertinggi, dan adakah jurang antara lelaki dan wanita melebar selepas tahun 2020?',
            Vietnamese: 'Nhóm tuổi và trình độ nào có tỷ lệ thất nghiệp cao nhất, và khoảng cách giữa nam và nữ có nới rộng sau năm 2020 không?',
            Japanese: '失業率が最も高い年齢層・学歴層はどこですか？また、2020年以降に男女間の差は広がりましたか？',
        },
    },
    {
        id: 'sg-visitor-arrivals',
        datasetId: 'd_d1c33009b674dcf70b8e8c790b793f28',
        theme: 'tourism',
        shape: 'Wide table with a three-level indented hierarchy (grand total, region subtotals, countries) and one column per month, newest month first, back to 2008. Region subtotal rows sit beside their country rows, so naive sums double count.',
        title: {
            English: 'International visitor arrivals by market',
            Mandarin: '按客源地划分的国际游客入境人数',
            Malay: 'Ketibaan pelawat antarabangsa mengikut pasaran',
            Vietnamese: 'Lượng khách quốc tế đến theo thị trường',
            Japanese: '居住地別の国際訪問者数',
        },
        description: {
            English: 'Monthly international visitor arrivals to Singapore by region and country of residence since 2008, with regional subtotals and one column per month.',
            Mandarin: '自2008年以来按地区和居住国划分的新加坡每月国际游客入境人数，含地区小计，每月一列。',
            Malay: 'Ketibaan pelawat antarabangsa bulanan ke Singapura mengikut rantau dan negara kediaman sejak tahun 2008, termasuk subjumlah serantau dan satu lajur bagi setiap bulan.',
            Vietnamese: 'Lượng khách quốc tế đến Singapore hằng tháng theo khu vực và quốc gia cư trú từ năm 2008, có tổng phụ theo khu vực và mỗi tháng một cột.',
            Japanese: '2008年以降のシンガポールへの月次国際訪問者数を地域・居住国別に示した表で、地域別の小計を含み、月ごとに1列が並びます。',
        },
        suggestedQuestion: {
            English: 'Which source markets have recovered above their 2019 visitor levels, and which are still lagging?',
            Mandarin: '哪些客源市场的游客人数已超过2019年的水平，哪些仍然落后？',
            Malay: 'Pasaran sumber manakah yang telah pulih melebihi tahap pelawat tahun 2019, dan pasaran manakah yang masih ketinggalan?',
            Vietnamese: 'Những thị trường nguồn nào đã phục hồi vượt mức khách năm 2019, và thị trường nào vẫn còn chậm?',
            Japanese: '訪問者数が2019年の水準を上回るまで回復した市場はどこですか？また、回復が遅れている市場はどこですか？',
        },
    },
    {
        id: 'sg-hdb-median-rent',
        datasetId: 'd_23000a00c52996c55106084ed0339566',
        theme: 'housing',
        shape: 'Long quarterly panel, one row per quarter, town and flat type, with a single median monthly rent column. Quarters are strings such as "2021-Q3", flat types are codes such as "3-RM" and "EXEC", and the rent column mixes numbers with two different non-numeric markers, "na" and "-".',
        // The full source (about 13,300 rows since 2005-Q2) is above the 10,000-row
        // demo target. Keep whole recent quarters so every town and flat type keeps
        // an unbroken, comparable series.
        sample: {
            method: `Rows whose quarter value is one of the latest ${RENT_SAMPLE_QUARTERS} distinct quarters in the source (15 years), kept in source order with each line copied byte for byte; older quarters are dropped. Nothing else is filtered.`,
            select: (rows) => {
                const quarterOf = (line) => line.slice(0, line.indexOf(','));
                const latest = new Set([...new Set(rows.map(quarterOf))].sort().slice(-RENT_SAMPLE_QUARTERS));
                return rows.filter((line) => latest.has(quarterOf(line)));
            },
        },
        title: {
            English: 'HDB median rents by town and flat type',
            Mandarin: '各市镇及房型的组屋租金中位数',
            Malay: 'Sewa median HDB mengikut bandar dan jenis flat',
            Vietnamese: 'Giá thuê trung vị HDB theo khu và loại căn hộ',
            Japanese: 'タウン・住戸タイプ別のHDB賃料中央値',
        },
        description: {
            English: 'Quarterly median monthly rent for HDB flats rented out in each town and flat type over the latest 15 years.',
            Mandarin: '最近15年各市镇、各房型出租组屋的季度月租金中位数。',
            Malay: 'Sewa bulanan median suku tahunan bagi flat HDB yang disewakan di setiap bandar dan jenis flat dalam tempoh 15 tahun terkini.',
            Vietnamese: 'Giá thuê hằng tháng trung vị theo quý của các căn hộ HDB cho thuê ở từng khu và loại căn hộ trong 15 năm gần nhất.',
            Japanese: '直近15年間について、タウン・住戸タイプ別に賃貸に出されたHDBフラットの月額賃料中央値を四半期ごとに示しています。',
        },
        suggestedQuestion: {
            English: 'Which towns have had the biggest rise in median rent for 3-room and 4-room flats since 2020, and where are rents now highest?',
            Mandarin: '自2020年以来，哪些市镇的三房式和四房式组屋租金中位数涨幅最大？目前哪里的租金最高？',
            Malay: 'Bandar manakah yang mencatat kenaikan sewa median terbesar bagi flat 3 bilik dan 4 bilik sejak tahun 2020, dan di manakah sewa kini paling tinggi?',
            Vietnamese: 'Những khu nào có giá thuê trung vị căn hộ 3 phòng và 4 phòng tăng nhiều nhất kể từ năm 2020, và hiện nay giá thuê cao nhất ở đâu?',
            Japanese: '2020年以降、3ルームと4ルームのフラットで賃料中央値が最も大きく上昇したタウンはどこですか？また、現在賃料が最も高いのはどこですか？',
        },
    },
    {
        id: 'sg-public-transport-ridership',
        datasetId: 'd_ba615ec4cc5d9f5b7800ad82057f36f1',
        theme: 'transport',
        shape: 'Wide indicator table: each row is a different metric (rail length, kilometres operated, average daily ridership by MRT, LRT and bus, point-to-point trips, total ridership, passenger-kilometres) and each column is a year, newest first, back to 1990. Rows mix units and the CSV has no unit column; gaps appear as "na".',
        title: {
            English: 'Public transport ridership and rail network',
            Mandarin: '公共交通客流量与铁路网络',
            Malay: 'Jumlah penumpang pengangkutan awam dan rangkaian rel',
            Vietnamese: 'Lượng hành khách giao thông công cộng và mạng lưới đường sắt',
            Japanese: '公共交通の利用者数と鉄道網',
        },
        description: {
            English: 'Yearly average daily ridership on MRT, LRT and buses, daily taxi and private-hire trips, and rail network length since 1990.',
            Mandarin: '自1990年以来每年地铁（MRT）、轻轨（LRT）和巴士的日均客流量、出租车及私召车的日均行程数，以及铁路网络长度。',
            Malay: 'Purata jumlah penumpang harian tahunan bagi MRT, LRT dan bas, perjalanan harian teksi dan kereta sewa persendirian, serta panjang rangkaian rel sejak tahun 1990.',
            Vietnamese: 'Lượng hành khách trung bình mỗi ngày theo năm trên MRT, LRT và xe buýt, số chuyến taxi và xe công nghệ mỗi ngày, cùng chiều dài mạng lưới đường sắt từ năm 1990.',
            Japanese: '1990年以降のMRT、LRT、バスの年間平均1日利用者数、タクシー・配車サービスの1日平均トリップ数、鉄道網の総延長をまとめています。',
        },
        suggestedQuestion: {
            English: 'Has rail and bus ridership recovered to its 2019 level, and how does ridership growth compare with the growth of the rail network?',
            Mandarin: '地铁和巴士客流量是否已恢复到2019年的水平？客流量增长与铁路网络扩展相比如何？',
            Malay: 'Adakah jumlah penumpang rel dan bas telah pulih ke tahap tahun 2019, dan bagaimanakah pertumbuhan jumlah penumpang berbanding dengan pertumbuhan rangkaian rel?',
            Vietnamese: 'Lượng hành khách đường sắt và xe buýt đã phục hồi về mức năm 2019 chưa, và mức tăng hành khách so với mức tăng của mạng lưới đường sắt ra sao?',
            Japanese: '鉄道とバスの利用者数は2019年の水準まで回復しましたか？また、利用者数の伸びは鉄道網の拡大と比べてどうですか？',
        },
    },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Quote-aware CSV scan: returns the header fields and the number of data records.
// Handles quoted commas, doubled quotes, quoted newlines and CRLF line endings.
const scanCsv = (text) => {
    const header = [];
    let field = '';
    let records = 0;
    let inQuotes = false;
    let recordHasContent = false;
    let inHeader = true;
    const endRecord = () => {
        if (inHeader) {
            header.push(field);
            inHeader = false;
        } else if (recordHasContent) {
            records += 1;
        }
        field = '';
        recordHasContent = false;
    };
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (inQuotes) {
            if (char === '"') {
                if (text[index + 1] === '"') {
                    if (inHeader) field += '"';
                    index += 1;
                } else {
                    inQuotes = false;
                }
            } else if (inHeader) {
                field += char;
            }
            continue;
        }
        if (char === '"') {
            inQuotes = true;
            recordHasContent = true;
        } else if (char === ',') {
            if (inHeader) header.push(field);
            field = '';
            recordHasContent = true;
        } else if (char === '\n') {
            endRecord();
        } else if (char !== '\r') {
            if (inHeader) field += char;
            recordHasContent = true;
        }
    }
    if (inHeader || recordHasContent) endRecord();
    return { header, rowCount: records };
};

// The public API rate-limits anonymous callers (HTTP 429), so back off and retry.
const fetchWithRetry = async (url) => {
    for (let attempt = 0; ; attempt += 1) {
        const response = await fetch(url);
        if (response.status !== 429 || attempt >= 6) return response;
        const retryAfterSeconds = Number(response.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 5000 * (attempt + 1));
    }
};

const fetchJson = async (url) => {
    const response = await fetchWithRetry(url);
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    const body = await response.json();
    if (body.code !== 0) throw new Error(`${url} returned code ${body.code}: ${body.errorMsg ?? ''}`);
    return body.data;
};

// data.gov.sg serves table downloads through a short-lived signed URL. Poll first;
// if the file is not ready, initiate a download and poll again with backoff.
const resolveDownloadUrl = async (datasetId) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const poll = await fetchJson(POLL_URL(datasetId));
        if (poll.status === 'DOWNLOAD_SUCCESS' && poll.url) return poll.url;
        if (attempt === 0 || poll.status === 'DOWNLOAD_FAILED') await fetchJson(INITIATE_URL(datasetId));
        await sleep(1500 * (attempt + 1));
    }
    throw new Error(`Download for ${datasetId} did not become ready`);
};

const downloadCsv = async (datasetId) => {
    const url = await resolveDownloadUrl(datasetId);
    const response = await fetchWithRetry(url);
    if (!response.ok) throw new Error(`Download for ${datasetId} returned HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
};

// Line-based sampling is only safe when no record spans lines, so refuse sources
// with quotes or CR characters rather than risk splitting a record.
const applySample = (dataset, text) => {
    if (text.includes('"') || text.includes('\r') || !text.endsWith('\n')) {
        throw new Error(`${dataset.id}: line-based sampling needs an unquoted LF-terminated CSV`);
    }
    const [header, ...rows] = text.slice(0, -1).split('\n');
    return Buffer.from(`${[header, ...dataset.sample.select(rows)].join('\n')}\n`, 'utf8');
};

const sourceLicenceBlock = (name) => ({
    name: LICENCE,
    version: '1.0',
    url: LICENCE_URL,
    attribution: `Contains information from "${name}" accessed from data.gov.sg, which is made available under the terms of the Singapore Open Data Licence version 1.0 (${LICENCE_URL}).`,
});

const buildOpenDataset = async (dataset) => {
    const metadata = await fetchJson(METADATA_URL(dataset.datasetId));
    const sourceBytes = await downloadCsv(dataset.datasetId);
    const sourceText = sourceBytes.toString('utf8');
    const sourceScan = scanCsv(sourceText);
    const bytes = dataset.sample ? applySample(dataset, sourceText) : sourceBytes;
    const { header, rowCount } = dataset.sample ? scanCsv(bytes.toString('utf8')) : sourceScan;
    if (bytes.length > MAX_BYTES || rowCount > MAX_ROWS) {
        throw new Error(`${dataset.id}: output has ${bytes.length} bytes and ${rowCount} rows, above the demo limits. Add or adjust a documented sampling rule before re-running.`);
    }
    const file = `${dataset.id}.csv`;
    const hash = sha256(bytes);
    const manifest = {
        id: dataset.id,
        source: `${metadata.managedBy} dataset published on data.gov.sg`,
        licence: sourceLicenceBlock(metadata.name),
        transformationPolicy: TRANSFORMATION_POLICY,
        sampling: dataset.sample?.method ?? NO_SAMPLING,
        shape: dataset.shape,
        output: {
            file,
            fields: header,
            rowCount,
            columnCount: header.length,
            sizeBytes: bytes.length,
            sha256: hash,
        },
        sources: [
            {
                datasetId: dataset.datasetId,
                title: metadata.name,
                publisher: metadata.managedBy,
                canonicalUrl: VIEW_URL(dataset.datasetId),
                metadataUrl: METADATA_URL(dataset.datasetId),
                downloadApi: POLL_URL(dataset.datasetId),
                lastUpdatedAt: metadata.lastUpdatedAt,
                coverageStart: metadata.coverageStart ?? null,
                coverageEnd: metadata.coverageEnd ?? null,
                rowCount: sourceScan.rowCount,
                sizeBytes: sourceBytes.length,
                downloadedCsvSha256: sha256(sourceBytes),
            },
        ],
    };
    console.log(`Fetched ${file}: ${rowCount} rows, ${header.length} columns, ${bytes.length} bytes`);
    const outputs = [
        [file, bytes],
        [`${dataset.id}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`],
    ];
    const entry = {
        id: dataset.id,
        file,
        title: dataset.title,
        description: dataset.description,
        theme: dataset.theme,
        rows: rowCount,
        columns: header.length,
        sizeBytes: bytes.length,
        speed: 'fast',
        suggestedQuestion: dataset.suggestedQuestion,
        source: {
            publisher: metadata.managedBy,
            datasetIds: [dataset.datasetId],
            url: VIEW_URL(dataset.datasetId),
            licence: LICENCE,
        },
    };
    return { entry, outputs };
};

const buildHdbEntry = async (entry) => {
    const hdbManifest = JSON.parse(await readFile(path.join(DEMO_DIR, HDB_SOURCE.manifest), 'utf8'));
    const filePath = path.join(DEMO_DIR, entry.file);
    const { header, rowCount } = scanCsv(await readFile(filePath, 'utf8'));
    return {
        id: entry.id,
        file: entry.file,
        title: entry.title,
        description: entry.description,
        theme: entry.theme,
        rows: rowCount,
        columns: header.length,
        sizeBytes: (await stat(filePath)).size,
        speed: entry.speed,
        suggestedQuestion: entry.suggestedQuestion,
        source: {
            publisher: HDB_SOURCE.publisher,
            datasetIds: hdbManifest.sources.map((source) => source.datasetId),
            url: HDB_SOURCE.url,
            licence: hdbManifest.licence,
        },
    };
};

// Download and validate everything before writing, so a failed or rate-limited
// run never leaves demo-data/ with a mix of old and new files.
const datasets = [];
const outputs = [];
for (const entry of HDB_ENTRIES) datasets.push(await buildHdbEntry(entry));
for (const dataset of OPEN_DATA_DATASETS) {
    const built = await buildOpenDataset(dataset);
    datasets.push(built.entry);
    outputs.push(...built.outputs);
}
outputs.push(['catalog.json', `${JSON.stringify({ version: 1, datasets }, null, 2)}\n`]);
for (const [file, content] of outputs) await writeFile(path.join(DEMO_DIR, file), content);
console.log(`Wrote ${outputs.length} files, including catalog.json with ${datasets.length} datasets`);
