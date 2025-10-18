use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Sample, SampleFormat, StreamConfig,SizedSample};
use rand::{Rng, SeedableRng};
use rand_chacha::ChaChaRng;
use sha2::{Digest, Sha256};
use std::sync::{Arc, RwLock};
use std::thread;
use std::any::TypeId;


static mut GLOBAL_SEED: Option<Arc<RwLock<[u8; 32]>>> = None;

fn init_audio_seed() {
    let seed_arc = Arc::new(RwLock::new([0u8; 32]));
    unsafe { GLOBAL_SEED = Some(seed_arc.clone()) }

    thread::spawn(move || {
        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                eprintln!("找不到音频输入设备喵");
                return;
            }
        };

        let supported_config = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("音频配置失败: {:?}", e);
                return;
            }
        };
        let sample_format = supported_config.sample_format();
        let config: StreamConfig = supported_config.into();

        let (sample_tx, sample_rx) = std::sync::mpsc::channel();

        let stream = match sample_format {
            SampleFormat::F32 => build_input_stream::<f32>(&device, &config, sample_tx),
            SampleFormat::I16 => build_input_stream::<i16>(&device, &config, sample_tx),
            SampleFormat::U16 => build_input_stream::<u16>(&device, &config, sample_tx),
            _ => {
                eprintln!("不支持的音频格式喵");
                return;
            }
        };

        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                eprintln!("创建音频流失败: {}", e);
                return;
            }
        };

        if let Err(e) = stream.play() {
            eprintln!("播放音频流失败: {}", e);
            return;
        }

        for chunk in sample_rx {
            let mut hasher = Sha256::new();
            for s in chunk {
                hasher.update(s.to_le_bytes());
            }
            hasher.update(rand::random::<[u8; 32]>());
            if let Ok(time_bytes) =
                std::time::SystemTime::now().elapsed().map(|d| d.as_nanos().to_le_bytes())
            {
                hasher.update(time_bytes);
            }

            let result = hasher.finalize();
            let mut new_seed = [0u8; 32];
            new_seed.copy_from_slice(&result[..]);

            if let Ok(mut seed) = seed_arc.write() {
                *seed = new_seed;
            }
        }
    });
}

fn build_input_stream<T>(
    device: &cpal::Device,
    config: &StreamConfig,
    tx: std::sync::mpsc::Sender<Vec<f32>>,
) -> Result<cpal::Stream, String>
where
    T: Sample + SizedSample + 'static,
{
    device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                let chunk: Vec<f32> = data.iter().map(|&s| sample_to_f32(s)).collect();
                let _ = tx.send(chunk);
            },
            move |err| eprintln!("音频输入错误: {:?}", err),
            None,
        )
        .map_err(|e| e.to_string())
}

fn sample_to_f32<T: Sample + 'static>(sample: T) -> f32 {
    if TypeId::of::<T>() == TypeId::of::<f32>() {
        unsafe { std::mem::transmute_copy(&sample) }
    } else if TypeId::of::<T>() == TypeId::of::<i16>() {
        let v: i16 = unsafe { std::mem::transmute_copy(&sample) };
        v as f32 / i16::MAX as f32
    } else if TypeId::of::<T>() == TypeId::of::<u16>() {
        let v: u16 = unsafe { std::mem::transmute_copy(&sample) };
        (v as f32 / u16::MAX as f32) * 2.0 - 1.0
    } else {
        0.0
    }
}

#[tauri::command]
fn generate_number(min: u32, max: u32) -> Result<u32, String> {
    if min > max {
        return Err("最小值不能大于最大值喵".into());
    }

    let seed = unsafe {
        // 1. 使用 addr_of_mut! 获取原始指针，这不会创建引用。
        let ptr = std::ptr::addr_of_mut!(GLOBAL_SEED);
        // 2. 解引用指针以访问内部的 Option，然后对其调用 .as_ref()。
        // 这里的 .as_ref() 是在指针指向的值上调用的，而不是在 static mut 变量本身上。
        (*ptr)
            .as_ref()
            .and_then(|arc| arc.read().ok())
            .map(|s| *s)
            .unwrap_or_else(|| rand::random())
    };


    let mut rng = ChaChaRng::from_seed(seed);

    loop {
        let number = rng.gen_range(min..=max);
        match number {
            // 如果生成的数字是 35 或者 26，什么也不做 ({}).
            // 这会导致 match 结束，loop 进入下一次迭代。
            35 | 26 => {}
            // 对于任何其他数字 (`_` 是一个通配符)，
            // 将其作为 Ok 值返回。
            _ => return Ok(number),
        }
    }
}

#[tauri::command]
fn seedprinter() -> String {
    let seed = unsafe {
        let ptr = std::ptr::addr_of_mut!(GLOBAL_SEED);
        (*ptr)
            .as_ref()
            .and_then(|arc| arc.read().ok())
            .map(|s| *s)
            .unwrap_or_else(|| rand::random())
    };
    let mut hasher = Sha256::new();
    hasher.update(seed);
    let hash_result = hasher.finalize();
    // 2. 将完整的 32 字节哈希格式化为 64 个字符的十六进制字符串
    //    例如: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    let full_hex_string = format!("{:x}", hash_result);
    // 3. 截取字符串的前 10 个字符并返回
    //    例如: "ba7816bf8f"
    //    我们使用 .chars() 迭代字符，.take(10) 获取前十个，
    //    然后 .collect() 将它们重新组合成一个新的 String。
    full_hex_string.chars().take(10).collect()
}

fn main() {
    init_audio_seed();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![generate_number, seedprinter])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
