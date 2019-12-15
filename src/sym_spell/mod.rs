pub trait Encode<T> {
    fn encode(&self) -> T;
}

pub mod sym_spell;
pub mod verbosity;
pub mod suggested_item;
